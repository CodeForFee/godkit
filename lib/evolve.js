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

const { paths, logEntries } = require('./paths')
const { configPath } = require('./lazy')

const MODES = ['audit_only', 'fix_only', 'autonomous']
const DEFAULT_MODE = 'audit_only'
const MARKER = '.godkit-link' // marks a copy we made, so we know we may replace it
const MAX_SKILL_BYTES = 16 * 1024
const NAME_RE = /^[a-z0-9][a-z0-9-]{1,63}$/
// A project skill is instructions. Hosts offer to run bundled scripts, so shipping one turns a
// markdown file into an execution vector.
const EXECUTABLE = /\.(js|mjs|cjs|sh|bash|ps1|py|rb|bat|cmd|exe|com|scr)$/i

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
function frontmatter(body) {
  const m = String(body || '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const out = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/)
    if (kv) out[kv[1]] = kv[2].trim()
  }
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
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
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
  try {
    body = fs.readFileSync(file, 'utf8')
  } catch {
    /* reported as a finding by scanSkill, not thrown */
  }
  const fm = frontmatter(body)
  return {
    name,
    dir,
    file,
    body,
    origin: fm.origin || 'authored',
    parent: fm.parent || null,
    created: fm.created || null,
    revised: fm.revised || fm.created || null,
    // Absent means enabled: a skill someone hand-wrote without frontmatter should still work.
    enabled: fm.enabled !== 'false',
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

// Findings carry a line number so the report points at a line, not just a file.
function scanSkill(skill) {
  const findings = []
  const block = (rule, line, text) => findings.push({ level: 'block', rule, line, text })

  if (skill.body === null) {
    block('contract', 0, 'SKILL.md is missing or unreadable')
    return findings
  }
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
    if (EXECUTABLE.test(abs)) {
      block('executable', 0, 'bundles an executable file: ' + path.basename(abs))
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

// Is `dest` something we are allowed to replace? Only if it is absent, a link resolving back
// into .agent/skills/, or a copy we marked. Anything else is the user's own file.
//
// This guard is the whole reason linking does not reuse link() from bin/godkit.js: that one
// rm -rf's any directory in the way, which is safe only because every destination it has ever
// had was one godkit created under ~/.claude/skills/.
function ownership(dest, srcDir) {
  let st
  try {
    st = fs.lstatSync(dest)
  } catch {
    return 'absent'
  }
  if (st.isSymbolicLink() || st.isDirectory()) {
    try {
      const real = fs.realpathSync(dest)
      const src = fs.realpathSync(srcDir)
      if (real === src) return 'ours-link'
    } catch {
      /* broken link, or src gone — fall through to the marker check */
    }
    if (fs.existsSync(path.join(dest, MARKER))) return 'ours-copy'
  }
  return 'foreign'
}

function linkOne(srcDir, dest) {
  const own = ownership(dest, srcDir)
  if (own === 'foreign') {
    return { ok: false, how: 'refused', reason: 'exists and is not ours — rename it, or move it into .agent/skills/' }
  }
  if (own !== 'absent') fs.rmSync(dest, { recursive: true, force: true })

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  try {
    fs.symlinkSync(srcDir, dest, process.platform === 'win32' ? 'junction' : 'dir')
    return { ok: true, how: 'linked' }
  } catch {
    // Symlinks need elevation on Windows and junctions do not, but a locked-down box can refuse
    // both. A copy works; it just stops tracking edits, so mark it and say so.
    fs.cpSync(srcDir, dest, { recursive: true })
    fs.writeFileSync(path.join(dest, MARKER), 'created by godkit skills --link\n')
    return { ok: true, how: 'copied' }
  }
}

function linkProjectSkills(root, opts) {
  const o = opts || {}
  const mode = o.mode || getEvolveMode()
  const results = []

  for (const skill of listSkills(root)) {
    const findings = scanSkill(skill)

    if (blocked(findings)) {
      // --force overrides the mode gate below. It never overrides a safety block.
      results.push({ skill: skill.name, ok: false, how: 'blocked', reason: 'safety scan found a blocking issue' })
      continue
    }
    if (!skill.enabled) {
      results.push({ skill: skill.name, ok: false, how: 'disabled', reason: 'enabled: false' })
      continue
    }
    // audit_only records candidates and changes nothing; fix_only allows repairs to existing
    // skills but no new captured/derived ones. Enforced here, at the filesystem, rather than
    // only being asked for in a skill's instructions.
    const generated = skill.origin === 'captured' || skill.origin === 'derived'
    if (generated && mode !== 'autonomous' && !o.force) {
      results.push({
        skill: skill.name,
        ok: false,
        how: 'mode',
        reason: 'mode ' + mode + ': recorded, not linked. GODKIT_EVOLVE_MODE=autonomous, or --force.',
      })
      continue
    }

    for (const { tool, base } of projectSkillTargets(root, o.tools)) {
      const r = linkOne(skill.dir, path.join(base, skill.name))
      results.push(Object.assign({ skill: skill.name, tool }, r))
    }
  }
  return results
}

function unlinkProjectSkills(root, opts) {
  const o = opts || {}
  const results = []
  for (const skill of listSkills(root)) {
    for (const { tool, base } of projectSkillTargets(root, o.tools)) {
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
function linkedTools(root, skill) {
  const out = []
  for (const { tool, base } of projectSkillTargets(root)) {
    if (ownership(path.join(base, skill.name), skill.dir) !== 'absent') out.push(tool)
  }
  return out
}

module.exports = {
  MODES,
  DEFAULT_MODE,
  MARKER,
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
  linkProjectSkills,
  unlinkProjectSkills,
  linkedTools,
  logEntries,
}
