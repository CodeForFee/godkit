'use strict'
// Project-local skills: the ones a project accumulates for itself, as opposed to the 13 this
// package ships. They live in .agent/skills/ because they are shared state between tools — the
// same argument as BOARD, MAP and the log — and get linked into the paths each host actually
// reads.
//
// Two things keep a generated skill from being dangerous, and neither is the pattern scan:
//   1. Inert until linked. No host reads .agent/skills/. Someone has to run `godkit skills
//      --link` (or set the mode to autonomous) before a skill reaches a path a host loads.
//   2. .agent/ is committed. Every skill and every revision lands in a diff.
// scanSkill() below is a speed bump on top of those, not a boundary. See its comment.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const { paths, logEntries, real } = require('./paths')
const { configPath } = require('./lazy')

const MODES = ['audit_only', 'fix_only', 'autonomous']
const DEFAULT_MODE = 'audit_only'
const MARKER = '.godkit-link'
const MARKER_OWNER = 'godkit-project-skill-snapshot'
const MARKER_VERSION = 1
const LEGACY_MARKER = 'created by godkit skills --link\n'
const MAX_SKILL_BYTES = 16 * 1024
const NAME_RE = /^[a-z0-9][a-z0-9-]{1,63}$/
const ORIGINS = new Set(['authored', 'captured', 'derived', 'fix'])
// A project skill is instructions. Hosts offer to run bundled scripts, so shipping one turns a
// markdown file into an execution vector.
const EXECUTABLE = /\.(js|mjs|cjs|sh|bash|ps1|py|rb|pl|php|lua|bat|cmd|exe|com|scr|jar|class|dll|so|dylib|wasm)$/i

function normalizeMode(mode) {
  if (typeof mode !== 'string') return null
  const m = mode.trim().toLowerCase()
  return MODES.includes(m) ? m : null
}

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw)
  } catch {
    return null
  }
}

// env -> config file -> default, the same resolution order lib/lazy.js uses. Reuses its
// configPath() rather than re-deriving the XDG/APPDATA split, so both settings share one file.
function getEvolveMode() {
  const env = normalizeMode(process.env.GODKIT_EVOLVE_MODE)
  if (env) return env
  const config = readJson(configPath())
  return (config && normalizeMode(config.evolveMode)) || DEFAULT_MODE
}

// godkit: godkit's own keys (origin, parent, created, revised, enabled) ride in the same
// frontmatter block as the host-visible name/description/license. Verified safe: the skills this
// package ships already carry non-standard keys (license, argument-hint) and load fine. If a host
// ever validates frontmatter strictly, move these into a sibling meta.json — readSkill() is the
// only reader, so nothing else changes.
const FRONTMATTER_ERRORS = Symbol('frontmatter-errors')

function withoutComment(raw) {
  let quote = null
  let escaped = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (quote === '"') {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') quote = null
      continue
    }
    if (quote === "'") {
      if (ch === "'" && raw[i + 1] === "'") i++
      else if (ch === "'") quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '#' && (i === 0 || /\s/.test(raw[i - 1]))) return raw.slice(0, i).trimEnd()
  }
  return raw.trimEnd()
}

function scalar(raw, key, line, errors) {
  const value = withoutComment(raw).trim()
  if (!value || (value[0] !== '"' && value[0] !== "'")) return value

  const quote = value[0]
  let end = -1
  let escaped = false
  for (let i = 1; i < value.length; i++) {
    const ch = value[i]
    if (quote === '"') {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') {
        end = i
        break
      }
    } else if (ch === "'" && value[i + 1] === "'") {
      i++
    } else if (ch === "'") {
      end = i
      break
    }
  }
  if (end === -1 || value.slice(end + 1).trim()) {
    errors.push('invalid quoted scalar for ' + key + ' at frontmatter line ' + line)
    return null
  }
  try {
    return quote === '"'
      ? JSON.parse(value.slice(0, end + 1))
      : value.slice(1, end).replace(/''/g, "'")
  } catch {
    errors.push('invalid quoted scalar for ' + key + ' at frontmatter line ' + line)
    return null
  }
}

function blockValue(style, lines) {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)[0].length)
  const indent = indents.length ? Math.min(...indents) : 0
  const text = lines.map((line) => line.trim() ? line.slice(indent) : '').join('\n').replace(/\n+$/, '')
  if (style === '|') return text
  return text
    .split(/\n{2,}/)
    .map((part) => part.replace(/\n/g, ' '))
    .join('\n')
}

function frontmatter(body) {
  const m = String(body || '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const out = {}
  const errors = []
  const lines = m[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([a-zA-Z][\w-]*):\s*(.*)$/)
    if (!kv) continue
    const key = kv[1]
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      errors.push('duplicate frontmatter key ' + key + ' at line ' + (i + 1))
      continue
    }

    const raw = withoutComment(kv[2]).trim()
    const block = raw.match(/^([>|])[+-]?$/)
    if (block) {
      const continuation = []
      while (i + 1 < lines.length && (!lines[i + 1].trim() || /^\s/.test(lines[i + 1]))) {
        continuation.push(lines[++i])
      }
      out[key] = blockValue(block[1], continuation)
      continue
    }
    const value = scalar(kv[2], key, i + 1, errors)
    if (value !== null) out[key] = value
  }
  Object.defineProperty(out, FRONTMATTER_ERRORS, { value: errors })
  return out
}

// Where the skills live, and where each host wants to see them. Kept here rather than in
// bin/godkit.js so the hook and the CLI cannot disagree about the paths.
function skillsDir(root) {
  return paths(root).skills
}

function listSkillNames(root) {
  try {
    return fs
      .readdirSync(skillsDir(root), { withFileTypes: true })
      .filter((d) => (d.isDirectory() || d.isSymbolicLink()) && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort()
  } catch {
    return [] // no project skills is the normal case, not an error
  }
}

function readSkill(root, name) {
  const dir = path.join(skillsDir(root), name)
  const file = path.join(dir, 'SKILL.md')
  let body = null
  let rootSymlink = false
  try {
    rootSymlink = fs.lstatSync(dir).isSymbolicLink()
    if (!rootSymlink) body = fs.readFileSync(file, 'utf8')
  } catch {
    /* reported as a finding by scanSkill, not thrown */
  }
  const fm = frontmatter(body)
  const metadataErrors = [...(fm[FRONTMATTER_ERRORS] || [])]
  const rawOrigin = typeof fm.origin === 'string' ? fm.origin.trim().toLowerCase() : ''
  const rawEnabled = typeof fm.enabled === 'string' ? fm.enabled.trim().toLowerCase() : ''
  if (!ORIGINS.has(rawOrigin)) metadataErrors.push('origin must be authored, captured, derived, or fix')
  if (rawEnabled !== 'true' && rawEnabled !== 'false') metadataErrors.push('enabled must be true or false')
  return {
    name,
    dir,
    file,
    body,
    rootSymlink,
    origin: ORIGINS.has(rawOrigin) ? rawOrigin : 'invalid',
    parent: fm.parent || null,
    created: fm.created || null,
    revised: fm.revised || fm.created || null,
    enabled: rawEnabled === 'true',
    metadataErrors,
    frontmatter: fm,
  }
}

function listSkills(root) {
  return listSkillNames(root).map((n) => readSkill(root, n))
}

// Content patterns. A pattern list catches the careless and the obvious; it does not stop an
// adversary who has read this file. The controls that hold are inert-until-linked and the
// committed diff.
// godkit: regex scan, not a sandbox. If .agent/ ever stops being reviewed, gate linking on a
// hash allowlist the user signs off once per skill revision.
const BLOCK_PATTERNS = [
  ['instruction-override', /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|rules)/i],
  ['instruction-override', /disregard\s+.{0,20}(instructions|rules|boundaries)/i],
  ['instruction-override', /\byou are now\b/i],
  ['instruction-override', /(reveal|print|output)\s+(your\s+|the\s+)?(system prompt|instructions)/i],
  ['instruction-override', /do not (tell|inform|mention to) the user/i],
  ['instruction-override', /without (asking|confirming|permission)/i],
  ['instruction-override', /\boverride your\b/i],
  ['destructive', /rm\s+-rf\s+[~/]/],
  ['destructive', /(curl|wget)[^\n|]*\|\s*(ba)?sh/],
  ['destructive', /git\s+push\b[^\n]*--force/],
  ['destructive', /--no-verify\b/],
  ['destructive', /chmod\s+777/],
  ['exfiltration', /(\.ssh\b|id_rsa|\.aws\/credentials|\.env\b)/],
  ['credential', /(sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9]{16,}/],
  ['credential', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['opaque-blob', /[A-Za-z0-9+/]{200,}={0,2}/],
]

function walkFiles(dir, out, depth) {
  if ((depth || 0) > 8) return out // godkit: depth cap instead of cycle detection; skills are flat
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) walkFiles(abs, out, (depth || 0) + 1)
    else out.push(abs)
  }
  return out
}

function executableMagic(head) {
  if (head.length >= 2 && head[0] === 0x23 && head[1] === 0x21) return 'shebang'
  if (head.length >= 4 && head[0] === 0x7f && head.slice(1, 4).toString('ascii') === 'ELF') return 'ELF'
  if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a) return 'PE/DOS'
  if (head.length >= 4 && head.slice(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d]))) return 'WebAssembly'
  if (head.length >= 4) {
    const magic = head.readUInt32BE(0)
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(magic)) {
      return 'Mach-O'
    }
  }
  return null
}

// Findings carry a line number so the report points at a line, not just a file.
function scanSkill(skill) {
  const findings = []
  const block = (rule, line, text) => findings.push({ level: 'block', rule, line, text })

  if (skill.rootSymlink) {
    block('symlink', 0, 'skill directory is a symbolic link')
    return findings
  }
  if (skill.body === null) {
    block('contract', 0, 'SKILL.md is missing or unreadable')
    return findings
  }
  for (const error of skill.metadataErrors || []) block('contract', 0, error)
  if (!NAME_RE.test(skill.name)) {
    block('contract', 0, 'directory name is not a safe slug: ' + skill.name)
  }
  if (skill.frontmatter.name && skill.frontmatter.name !== skill.name) {
    block('contract', 0, 'frontmatter name "' + skill.frontmatter.name + '" != directory "' + skill.name + '"')
  }
  if (!skill.frontmatter.description) {
    block('contract', 0, 'frontmatter needs a description — it is how a host decides to load the skill')
  } else if (skill.frontmatter.description.length > 1024) {
    block('contract', 0, 'description is longer than 1024 chars')
  }
  if (!/^##\s+Boundaries/m.test(skill.body)) {
    block('contract', 0, 'no ## Boundaries section — say what this skill does not do')
  }
  if (Buffer.byteLength(skill.body, 'utf8') > MAX_SKILL_BYTES) {
    block('contract', 0, 'SKILL.md is larger than 16 KB')
  }

  for (const abs of walkFiles(skill.dir, [])) {
    let stat
    try {
      stat = fs.lstatSync(abs)
    } catch {
      block('contract', 0, 'cannot inspect bundled file: ' + path.basename(abs))
      continue
    }
    if (stat.isSymbolicLink()) {
      block('symlink', 0, 'bundles a symbolic link: ' + path.basename(abs))
      continue
    }
    if (!stat.isFile()) {
      block('executable', 0, 'bundles a non-regular file: ' + path.basename(abs))
      continue
    }
    if (path.basename(abs) === MARKER) {
      block('contract', 0, 'bundles reserved ownership marker: ' + MARKER)
      continue
    }
    if (EXECUTABLE.test(abs)) {
      block('executable', 0, 'bundles an executable file: ' + path.basename(abs))
    }
    if ((stat.mode & 0o111) !== 0) {
      block('executable-mode', 0, 'bundles a file with executable mode: ' + path.basename(abs))
    }
    try {
      const fd = fs.openSync(abs, 'r')
      const head = Buffer.alloc(8)
      let read = 0
      try {
        read = fs.readSync(fd, head, 0, head.length, 0)
      } finally {
        fs.closeSync(fd)
      }
      const magic = executableMagic(head.subarray(0, read))
      if (magic) block('executable-magic', 0, 'bundles ' + magic + ' content: ' + path.basename(abs))
    } catch {
      block('contract', 0, 'cannot read bundled file: ' + path.basename(abs))
    }
  }

  const lines = skill.body.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    for (const [rule, re] of BLOCK_PATTERNS) {
      if (re.test(lines[i])) block(rule, i + 1, lines[i].trim().slice(0, 120))
    }
  }

  // Warnings are reported and never block: a link to docs is normal in a skill.
  for (let i = 0; i < lines.length; i++) {
    if (/https?:\/\//.test(lines[i]) && !BLOCK_PATTERNS.some(([, re]) => re.test(lines[i]))) {
      findings.push({ level: 'warn', rule: 'external-url', line: i + 1, text: lines[i].trim().slice(0, 120) })
    }
  }

  return findings
}

function blocked(findings) {
  return findings.some((f) => f.level === 'block')
}

// Which host paths a project skill should be projected into. Only hosts with a project-level
// skill directory appear here; Cursor and Antigravity have none, and read .agent/SKILLS.md and
// the always-on rule file instead.
const PROJECT_TOOLS = {
  claude: ['.claude', 'skills'],
  // godkit: mirrors the .agents/rules/godkit.md path godkit already writes for Codex. Unverified
  // against a live Codex — if it reads somewhere else, only this line changes.
  codex: ['.agents', 'skills'],
}

function projectSkillTargets(root, tools) {
  const want = tools && tools.length ? tools : Object.keys(PROJECT_TOOLS)
  const out = []
  for (const t of want) {
    if (!PROJECT_TOOLS[t]) continue
    out.push({ tool: t, base: path.join(root, ...PROJECT_TOOLS[t]) })
  }
  return out
}

function legacyLinkTarget(dest) {
  try {
    return path.resolve(path.dirname(dest), fs.readlinkSync(dest).replace(/^\\\\\?\\/, ''))
  } catch {
    return real(dest)
  }
}

function legacyLinkOwned(dest, skillsRoot) {
  const target = legacyLinkTarget(dest)
  if (!target) return false
  const rel = path.relative(path.resolve(skillsRoot), path.resolve(target))
  return Boolean(rel && !rel.startsWith('..') && !path.isAbsolute(rel) &&
    path.dirname(rel) === '.' && NAME_RE.test(path.basename(rel)) && path.basename(rel) === path.basename(dest))
}

// Hash relative paths and bytes in stable order. The projection marker itself is metadata, not
// skill content, so callers validating a snapshot exclude only the root marker.
function treeHash(dir, excludeMarker) {
  const files = []
  function visit(current, relDir) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const rel = relDir ? path.posix.join(relDir, entry.name) : entry.name
      if (excludeMarker && rel === MARKER) continue
      const abs = path.join(current, entry.name)
      const stat = fs.lstatSync(abs)
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) return false
      if (stat.isDirectory()) {
        if (!visit(abs, rel)) return false
      } else {
        files.push({ abs, rel })
      }
    }
    return true
  }

  try {
    if (!visit(dir, '')) return null
    const hash = crypto.createHash('sha256')
    for (const file of files) {
      const rel = Buffer.from(file.rel, 'utf8')
      const body = fs.readFileSync(file.abs)
      hash.update(String(rel.length) + ':')
      hash.update(rel)
      hash.update(String(body.length) + ':')
      hash.update(body)
    }
    return hash.digest('hex')
  } catch {
    return null
  }
}

function readMarker(dest) {
  const file = path.join(dest, MARKER)
  try {
    if (!fs.lstatSync(file).isFile()) return null
    const raw = fs.readFileSync(file, 'utf8')
    if (raw === LEGACY_MARKER) return { legacy: true }
    const marker = JSON.parse(raw)
    if (!marker || marker.owner !== MARKER_OWNER || marker.version !== MARKER_VERSION ||
        marker.skill !== path.basename(dest) || !/^[a-f0-9]{64}$/.test(marker.sha256 || '')) return null
    return marker
  } catch {
    return null
  }
}

function markerBody(srcDir, sha256) {
  return JSON.stringify({
    owner: MARKER_OWNER,
    version: MARKER_VERSION,
    skill: path.basename(srcDir),
    sha256,
  }, null, 2) + '\n'
}

// Is `dest` something we are allowed to replace? Only if it is absent, a link resolving back
// into .agent/skills/, or a copy we marked. Anything else is the user's own file.
//
// This guard is the whole reason linking does not reuse link() from bin/godkit.js: that one
// rm -rf's any directory in the way, which is safe only because every destination it has ever
// had was one godkit created under ~/.claude/skills/.
function ownership(dest, srcDir) {
  let stat
  try {
    stat = fs.lstatSync(dest)
  } catch {
    return 'absent'
  }
  if (stat.isSymbolicLink()) {
    return legacyLinkOwned(dest, path.dirname(srcDir)) ? 'ours-link' : 'foreign'
  }
  if (!stat.isDirectory()) return 'foreign'

  const marker = readMarker(dest)
  if (!marker) return 'foreign'
  const actual = treeHash(dest, true)
  if (!actual) return 'foreign'
  const source = treeHash(srcDir, false)
  if (marker.legacy) {
    // Old copies carry no digest. Replace them only when their bytes still match the source; an
    // edited old projection is user data now. A missing source is an owned orphan for --unlink.
    return !source || source === actual ? 'ours-copy' : 'foreign'
  }
  if (actual !== marker.sha256) return 'foreign'
  return source === marker.sha256 ? 'ours-snapshot' : 'ours-stale'
}

function linkOne(srcDir, dest) {
  const own = ownership(dest, srcDir)
  if (own === 'foreign') {
    return { ok: false, how: 'refused', reason: 'exists and is not ours — rename it, or move it into .agent/skills/' }
  }
  const sha256 = treeHash(srcDir, false)
  if (!sha256) return { ok: false, how: 'refused', reason: 'source is unreadable or contains a link' }
  if (own === 'ours-snapshot') return { ok: true, how: 'current', sha256 }

  const parent = path.dirname(dest)
  fs.mkdirSync(parent, { recursive: true })
  const tmp = fs.mkdtempSync(path.join(parent, '.godkit-snapshot-'))
  try {
    fs.cpSync(srcDir, tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, MARKER), markerBody(srcDir, sha256))
    if (treeHash(tmp, true) !== sha256) throw new Error('snapshot hash mismatch')
    if (own !== 'absent') fs.rmSync(dest, { recursive: true, force: true })
    fs.renameSync(tmp, dest)
    return { ok: true, how: own === 'absent' ? 'snapshotted' : 'refreshed', sha256 }
  } catch (err) {
    return { ok: false, how: 'failed', reason: err.message }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

const OWNED_PROJECTIONS = new Set(['ours-link', 'ours-copy', 'ours-snapshot', 'ours-stale'])

function denyAndRevoke(skill, targets, results, how, reason) {
  const revoked = []
  const foreign = []
  for (const { tool, base } of targets) {
    const dest = path.join(base, skill.name)
    const own = ownership(dest, skill.dir)
    if (OWNED_PROJECTIONS.has(own)) {
      fs.rmSync(dest, { recursive: true, force: true })
      revoked.push(tool)
    } else if (own === 'foreign') {
      foreign.push(tool)
    }
  }
  results.push({ skill: skill.name, ok: false, how, reason, revoked, foreign })
}

function linkProjectSkills(root, opts) {
  const o = opts || {}
  const mode = o.mode || getEvolveMode()
  const results = []
  // Quarantine has to bite here or it means nothing: a skill the logs have blamed twice must not
  // reach a host path, and --force must not be able to drag it there either.
  const signals = readLogSignals(root)

  for (const skill of listSkills(root)) {
    const findings = scanSkill(skill)
    const targets = projectSkillTargets(root, o.tools)

    if (blocked(findings)) {
      // --force overrides the mode gate below. It never overrides a safety block.
      denyAndRevoke(skill, targets, results, 'blocked', 'safety scan found a blocking issue')
      continue
    }
    if (!skill.enabled) {
      denyAndRevoke(skill, targets, results, 'disabled', 'enabled: false')
      continue
    }
    const evidence = tally(skill, signals)
    if (trustOf(skill, evidence, findings) === TRUST.QUARANTINED) {
      denyAndRevoke(
        skill,
        targets,
        results,
        'quarantined',
        evidence.failures + ' attributable failures in the logs — fix it and bump `revised:`',
      )
      continue
    }
    // audit_only records candidates and changes nothing; fix_only allows repairs to existing
    // skills but no new captured/derived ones. Enforced here, at the filesystem, rather than
    // only being asked for in a skill's instructions.
    const generated = skill.origin === 'captured' || skill.origin === 'derived'
    if (generated && mode !== 'autonomous' && !o.force) {
      denyAndRevoke(
        skill,
        targets,
        results,
        'mode',
        'mode ' + mode + ': recorded, not linked. GODKIT_EVOLVE_MODE=autonomous, or --force.',
      )
      continue
    }

    for (const { tool, base } of targets) {
      const r = linkOne(skill.dir, path.join(base, skill.name))
      results.push(Object.assign({ skill: skill.name, tool }, r))
    }
  }
  return results
}

function unlinkProjectSkills(root, opts) {
  const o = opts || {}
  const results = []
  const skills = new Map(listSkills(root).map((skill) => [skill.name, skill]))
  for (const { tool, base } of projectSkillTargets(root, o.tools)) {
    const names = new Set(skills.keys())
    try {
      for (const name of fs.readdirSync(base)) {
        const srcDir = path.join(skillsDir(root), name)
        if (ownership(path.join(base, name), srcDir) !== 'foreign') names.add(name)
      }
    } catch {
      /* no host skill directory yet */
    }
    for (const name of names) {
      const skill = skills.get(name) || { name, dir: path.join(skillsDir(root), name) }
      const dest = path.join(base, skill.name)
      const own = ownership(dest, skill.dir)
      if (own === 'absent') continue
      if (own === 'foreign') {
        results.push({ skill: skill.name, tool, ok: false, how: 'refused', reason: 'not ours — left alone' })
        continue
      }
      fs.rmSync(dest, { recursive: true, force: true })
      results.push({ skill: skill.name, tool, ok: true, how: 'removed' })
    }
  }
  return results
}

// Which hosts currently see this skill. Used by the report and by doctor.
function projectionStatus(root, skill) {
  const out = { current: [], stale: [], foreign: [], legacy: [] }
  for (const { tool, base } of projectSkillTargets(root)) {
    const own = ownership(path.join(base, skill.name), skill.dir)
    if (own === 'ours-snapshot') out.current.push(tool)
    else if (own === 'ours-stale') out.stale.push(tool)
    else if (own === 'foreign') out.foreign.push(tool)
    else if (own === 'ours-link' || own === 'ours-copy') out.legacy.push(tool)
  }
  return out
}

// Backward-compatible array for current callers; only byte-current owned snapshots count as
// linked. Detailed states stay available without making old `.length`/`.join()` callers lie.
function linkedTools(root, skill) {
  const status = projectionStatus(root, skill)
  const out = status.current.slice()
  for (const key of ['stale', 'foreign', 'legacy']) {
    Object.defineProperty(out, key, { value: status[key] })
  }
  return out
}

// ---------------------------------------------------------------------------
// Evidence. Everything below derives from .agent/log/*.md and holds no state of its own.
//
// What this can and cannot know, stated once so it is not overclaimed anywhere else: godkit does
// not run the agent, so it cannot observe a skill being used. The `skills:` log field is a
// SELF-REPORT by the same agent that just used it, and self-reports skew positive. A trust level
// here means "used repeatedly, and the sessions that used it finished verified" — a usage/outcome
// correlation, never a quality measure.
//
// Why not SQLite, since this rescans markdown every run:
//   1. A .db is binary, so git cannot merge it. The entire protocol is "one file per session so
//      two tools writing at the same moment never conflict, and git merges them without a
//      thought". A single binary store inverts that — every parallel session collides.
//   2. Logs must stay markdown regardless: a human and every tool have to read them. So a
//      database could only ever be a derived cache, i.e. a second store that can desync from the
//      truth — the exact failure the board decision about graph.json exists to prevent.
//   3. node:sqlite is Node 22+; engines say >=18 and CI runs 18. A dependency instead would break
//      the zero-runtime-deps constraint, which is what buys the no-install-step story.
// Measured, 500 log entries: 235 ms end to end, ~40 ms of that node startup, 180 ms file I/O, and
// 1 ms for the O(n^2) clustering. It is I/O-bound, so a database would not fix what costs.
// godkit: if a project ever reaches thousands of logs, add a GITIGNORED .agent/skills/.index.json
// keyed by filename+mtime — derived, disposable, never authoritative, never read by anything that
// can act on it.

const TRUST = { QUARANTINED: 'quarantined', PROVISIONAL: 'provisional', TRUSTED: 'trusted' }

// 2026-08-22T1403Z-claude-82df4726.md -> the sortable UTC prefix. Filenames are UTC-first
// precisely so a lexical compare is chronological, which is what the evidence window needs.
function logStamp(file) {
  const m = path.basename(file).match(/^(\d{4}-\d{2}-\d{2}T\d{4}Z)/)
  return m ? m[1] : null
}

function logSession(file) {
  return 'file:' + path.basename(file, path.extname(file))
}

// Line-based on purpose. The regex version of this used \Z for end-of-input, which JS does not
// have — it matched a literal "Z", so the LAST section in a log (## Bugs) never parsed and blame
// silently never registered.
function section(body, name) {
  const want = name.toLowerCase()
  const out = []
  let inside = false
  for (const line of String(body || '').split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      if (inside) break
      inside = heading[1].toLowerCase() === want
      continue
    }
    if (inside) out.push(line)
  }
  return out.join('\n')
}

function bullets(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- ') && l.slice(2).trim().length)
    .map((l) => l.slice(2).trim())
}

// One record per log entry. Nothing skill-specific yet — attribution happens in tally().
function readLogSignals(root) {
  const out = []
  for (const file of logEntries(paths(root).dir)) {
    let body
    try {
      body = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const fm = frontmatter(body)
    out.push({
      file,
      when: logStamp(file),
      session: (fm.session || '').trim() || logSession(file),
      status: (fm.status || '').trim().toLowerCase(),
      skills: String(fm.skills || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      verified: bullets(section(body, 'Verified')).length,
      bugs: bullets(section(body, 'Bugs')),
      // Kept raw for lib/hotspots.js, which ranks files rather than skills. taskTokens folds
      // scope into a bag of words, which is right for similarity and useless for paths.
      scope: String(fm.scope || '').trim(),
      did: bullets(section(body, 'Did')),
      // Computed here so candidates() needs no file access at all. Reading the log stream twice
      // was the single biggest cost in this module — the whole pass is I/O, not computation.
      taskTokens: tokens(section(body, 'Task') + ' ' + (fm.scope || '')),
    })
  }
  return out
}

// Tally one skill against the log stream, inside its evidence window.
//
// The window is `when >= skill.revised`: edit a skill and bump revised, and its history resets.
// Without that, a six-month-old failure would count against text that no longer exists — which is
// the whole reason a derived-not-stored record is correct here rather than merely cheaper.
function tally(skill, signals) {
  const since = skill.revised || ''
  const ev = { successes: 0, failures: 0, neutral: 0, sessions: [], logs: [], blamedIn: [] }

  for (const s of signals) {
    if (!s.skills.includes(skill.name)) continue
    if (since && s.when && s.when < since) continue

    // A Bugs bullet naming the skill is the only unambiguous blame available.
    const blamed = s.bugs.some((b) => b.toLowerCase().includes(skill.name.toLowerCase()))
    // A blocked session attributes only when exactly one skill was in play. With three listed,
    // none of them individually caused it, and guessing would demote a good skill — the
    // expensive error, since a demotion is what stops a skill being linked.
    const soleAndBlocked = s.status === 'blocked' && s.skills.length === 1

    if (blamed || soleAndBlocked) {
      ev.failures++
      ev.blamedIn.push(s.file)
    } else if (s.status === 'done' && s.verified > 0) {
      ev.successes++
      if (s.session && !ev.sessions.includes(s.session)) ev.sessions.push(s.session)
    } else {
      ev.neutral++
    }
    ev.logs.push(s.file)
  }
  return ev
}

// Promotion needs 3 successes across 3 DISTINCT sessions: two can be one task retried once by one
// agent on one day, which is not evidence of anything. Demotion needs only 1 failure — asymmetric
// on purpose, because a wrong instruction auto-loaded into an agent's context costs more than a
// slow promotion does.
function trustOf(skill, evidence, findings) {
  if (findings && blocked(findings)) return TRUST.QUARANTINED
  if (!skill.enabled) return TRUST.QUARANTINED
  if (evidence.failures >= 2) return TRUST.QUARANTINED
  if (evidence.failures >= 1) return TRUST.PROVISIONAL
  if (evidence.successes >= 3 && evidence.sessions.length >= 3) return TRUST.TRUSTED
  return TRUST.PROVISIONAL
}

const STOPWORDS = new Set(
  ('the and for with from that this then than into over under after before while when what which ' +
    'have has had was were will would could should about across against because been being ' +
    'both each more most other some such only same very also just like make made does done ' +
    'their there these those they them your yours our ours out off up down again once here')
    .split(/\s+/),
)

function tokens(text) {
  const set = new Set()
  for (const raw of String(text || '').toLowerCase().split(/[^a-z]+/)) {
    if (raw.length >= 4 && !STOPWORDS.has(raw)) set.add(raw)
  }
  return set
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / (a.size + b.size - shared)
}

// Clusters of log entries that look like the same shaped job. Deliberately high-recall and
// low-precision: this only surfaces candidates, and godkit-evolve's instructions are explicit
// that most should be rejected. A script cannot tell "a repeatable procedure" from "three
// similar tasks" — that is the judgment half.
//
// godkit: naive O(n^2) pairwise Jaccard over ## Task + scope. Measured at ~15 ms for 500 entries
// once the redundant file reads were removed, so the quadratic is not what costs here. If a
// project ever has thousands of logs, build a token -> entry inverted index first.
function candidates(signals, opts) {
  const o = opts || {}
  const min = o.min || 3
  const entries = []
  for (const s of signals) {
    const t = s.taskTokens
    if (t && t.size) entries.push({ file: s.file, session: s.session, tokens: t })
  }

  const used = new Set()
  const clusters = []
  for (let i = 0; i < entries.length; i++) {
    if (used.has(i)) continue
    const group = [entries[i]]
    for (let j = i + 1; j < entries.length; j++) {
      if (used.has(j)) continue
      if (jaccard(entries[i].tokens, entries[j].tokens) >= (o.threshold || 0.5)) {
        group.push(entries[j])
        used.add(j)
      }
    }
    const sessions = new Set(group.map((g) => g.session).filter(Boolean))
    if (sessions.size < min) continue
    used.add(i)

    let shared = null
    for (const g of group) {
      if (shared === null) shared = new Set(g.tokens)
      else for (const t of [...shared]) if (!g.tokens.has(t)) shared.delete(t)
    }
    clusters.push({
      sessions: sessions.size,
      shared: [...(shared || [])].sort().slice(0, 8),
      logs: group.map((g) => g.file),
    })
  }
  return clusters
}

// The full picture for one skill: what it is, what the scan found, what the logs say.
function report(root) {
  const signals = readLogSignals(root)
  const skills = listSkills(root).map((skill) => {
    const findings = scanSkill(skill)
    const evidence = tally(skill, signals)
    return {
      skill,
      findings,
      evidence,
      trust: trustOf(skill, evidence, findings),
      linked: linkedTools(root, skill),
    }
  })
  const attributed = signals.filter((s) => s.skills.length).length
  return {
    mode: getEvolveMode(),
    skills,
    signals,
    coverage: { attributed, total: signals.length },
    candidates: candidates(signals),
  }
}

const DOC_HEADER = [
  '<!-- Generated by `godkit evolve --write` from .agent/skills/ and .agent/log/.',
  '     Do not hand-edit: the next run overwrites it. Edit the skill, or write a log entry. -->',
].join('\n')

function renderSkillsDoc(root, rep) {
  const name = path.basename(root)
  const L = []
  L.push('# Project skills — ' + name)
  L.push('')
  L.push(DOC_HEADER)
  L.push('')
  L.push(
    '**Generated:** ' + new Date().toISOString() + ' · **Skills:** ' + rep.skills.length +
      ' · **Mode:** ' + rep.mode,
  )
  L.push('')
  L.push('Trust here means "used repeatedly, and the sessions that used it finished verified" — a')
  L.push('usage/outcome correlation self-reported in log frontmatter, not a causal quality measure.')
  L.push('A trusted skill can still be wrong. Read the skill.')
  L.push('')

  if (!rep.skills.length) {
    L.push('No skills in `.agent/skills/` yet. See the **godkit-evolve** skill.')
    L.push('')
    return L.join('\n')
  }

  L.push('| skill | origin | trust | ok | bad | sessions | linked | what it is |')
  L.push('|---|---|---|---|---|---|---|---|')
  for (const r of rep.skills) {
    const desc = (r.skill.frontmatter.description || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    L.push(
      '| `' + r.skill.name + '` | ' + r.skill.origin + ' | ' +
        (r.trust === TRUST.QUARANTINED ? '**QUARANTINED**' : r.trust) + ' | ' +
        r.evidence.successes + ' | ' + r.evidence.failures + ' | ' +
        r.evidence.sessions.length + ' | ' +
        (r.linked.length ? r.linked.join(' ') : '—') + ' | ' + desc + ' |',
    )
  }
  L.push('')

  const withFindings = rep.skills.filter((r) => r.findings.some((f) => f.level === 'block'))
  if (withFindings.length) {
    L.push('## Findings')
    L.push('')
    for (const r of withFindings) {
      for (const f of r.findings) {
        if (f.level !== 'block') continue
        L.push('- `' + r.skill.name + '` — **BLOCK** ' + f.rule + ' at SKILL.md:' + f.line +
          '. Not linked, and `--force` will not link it.')
      }
    }
    L.push('')
  }

  if (rep.candidates.length) {
    L.push('## Capture candidates')
    L.push('')
    for (const c of rep.candidates) {
      L.push('- ' + c.sessions + ' sessions did a similarly shaped job (' +
        c.shared.map((s) => '`' + s + '`').join(', ') + '). See **godkit-evolve**.')
      for (const f of c.logs) L.push('  - ' + path.posix.join('.agent/log', path.basename(f)))
    }
    L.push('')
  }

  L.push('## Coverage')
  L.push('')
  const unattributed = rep.coverage.total - rep.coverage.attributed
  L.push(unattributed + ' of ' + rep.coverage.total +
    ' log entries carried no `skills:` frontmatter. Those produced no signal either way.')
  L.push('')
  return L.join('\n')
}

module.exports = {
  MODES,
  DEFAULT_MODE,
  MARKER,
  MARKER_OWNER,
  TRUST,
  PROJECT_TOOLS,
  normalizeMode,
  getEvolveMode,
  frontmatter,
  skillsDir,
  listSkillNames,
  readSkill,
  listSkills,
  scanSkill,
  blocked,
  projectSkillTargets,
  ownership,
  projectionStatus,
  linkProjectSkills,
  unlinkProjectSkills,
  linkedTools,
  logEntries,
  readLogSignals,
  tally,
  trustOf,
  candidates,
  report,
  renderSkillsDoc,
}
