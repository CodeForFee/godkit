#!/usr/bin/env node
'use strict'
// godkit — scaffold the shared .agent/ contract into a project, and install the skills into
// whichever agent tools are on this machine.

const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const TEMPLATES = path.join(ROOT, 'templates')
const SKILLS = path.join(ROOT, 'skills')
const { projectRoot, paths, utcStamp } = require('../lib/paths')

// Where each tool looks for skills, and how it wants them laid out.
//   per-skill: one link per skill directory
//   folder   : one link named godkit for the whole skills/ directory
const TOOLS = {
  claude: { dir: ['.claude', 'skills'], style: 'per-skill', hooks: true },
  codex: { dir: ['.agents', 'skills'], style: 'per-skill', hooks: true },
  antigravity: { dir: ['.gemini', 'antigravity', 'skills'], style: 'folder', hooks: false },
  cursor: { dir: null, style: 'rules-only', hooks: false },
}

function log(msg) {
  process.stdout.write(msg + '\n')
}

function version() {
  return require('../package.json').version
}

function tpl(name, vars) {
  let s = fs.readFileSync(path.join(TEMPLATES, name), 'utf8')
  for (const [k, v] of Object.entries(vars || {})) s = s.split('{{' + k + '}}').join(v)
  return s
}

// Never clobber. Everything .agent/ holds is written by agents; a second `init` must be safe.
function writeIfAbsent(file, content) {
  if (fs.existsSync(file)) return false
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  return true
}

// A host file the user also writes in. We own the marked block and nothing else — and if the
// markers were hand-edited into something ambiguous we refuse rather than guess.
function writeManaged(file, content, style) {
  const { applyBlock } = require('../lib/managed')
  let existing = null
  try {
    existing = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code !== 'ENOENT') return { action: 'refused', reason: err.message }
  }

  let result
  try {
    result = applyBlock(existing, content, style)
  } catch (err) {
    return { action: 'refused', reason: err.message }
  }
  if (result.action === 'unchanged') return result

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, result.text)
  return result
}

function skillNames() {
  try {
    return fs
      .readdirSync(SKILLS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  } catch {
    return []
  }
}

// What each tool's install and uninstall actually touch. lib/install.js decides what is ours;
// this only turns a tool spec into source/destination pairs.
function skillPairs(spec, names) {
  const base = path.join(os.homedir(), ...spec.dir)
  if (spec.style === 'folder') return { base, pairs: [[SKILLS, path.join(base, 'godkit')]] }
  return { base, pairs: names.map((n) => [path.join(SKILLS, n), path.join(base, n)]) }
}

// Whether this machine already has the hooks registered for every tool that takes them. False on
// a first run, true forever after — which is what keeps `init` from touching home config it has
// nothing to add to. Skills are no longer part of it: `init` puts them in the project.
function machineReady() {
  const lib = require('../lib/install')
  for (const [, file] of lib.settingsTargets()) {
    let record
    try {
      record = lib.readSettings(file)
    } catch {
      return true // unreadable settings are cmdHooks' problem to report, not init's to overwrite
    }
    if (countOurHooks(record.settings) < lib.HOOKS.length) return false
    if (hooksPointElsewhere(record.settings)) return false // an older copy's path: re-point
  }
  return true
}

function eachOurHandler(settings, fn) {
  const lib = require('../lib/install')
  for (const groups of Object.values((settings && settings.hooks) || {})) {
    for (const group of groups || []) {
      for (const handler of (group && group.hooks) || []) if (lib.isOurHandler(handler)) fn(handler)
    }
  }
}

function countOurHooks(settings) {
  let found = 0
  eachOurHandler(settings, () => found++)
  return found
}

// True when a registered godkit hook runs a script from a different copy than this one.
function hooksPointElsewhere(settings) {
  const here = path.join(ROOT, 'hooks').replace(/\\/g, '/')
  let elsewhere = false
  eachOurHandler(settings, (h) => {
    if (!h.command.replace(/\\/g, '/').includes(here)) elsewhere = true
  })
  return elsewhere
}

// The per-project skill copies: every skill, into the two paths the hosts read. Committed with the
// project, so a fresh clone on another machine has them with nothing installed.
const PROJECT_SKILL_DIRS = [['.claude', 'skills'], ['.agents', 'skills']]

function installProjectSkills(root) {
  const { installOne } = require('../lib/install')
  const names = skillNames()
  const label = 'godkit@' + version()
  let done = 0
  const refused = []
  for (const dir of PROJECT_SKILL_DIRS) {
    for (const n of names) {
      const result = installOne(path.join(SKILLS, n), path.join(root, ...dir, n), false, { copy: true, label })
      if (result.ok) done++
      else refused.push(dir.concat(n).join('/') + ' — ' + result.reason)
    }
  }
  return { names, done, refused }
}

function cmdInit(args) {
  const startedAt = Date.now()
  const given = args.find((a) => !a.startsWith('-'))
  const root = given ? path.resolve(given) : projectRoot(process.cwd())
  const p = paths(root)
  const name = path.basename(root)
  const vars = { PROJECT: name, UTC: utcStamp() }
  const code = require('../lib/scan').codeCount(root)
  // A folder with no code is a new project whether or not anyone remembered --new.
  const greenfield = args.includes('--new') || code.count === 0
  const hadAgent = fs.existsSync(p.dir)

  fs.mkdirSync(p.tasks, { recursive: true })
  fs.mkdirSync(p.log, { recursive: true })

  const wrote = []
  if (writeIfAbsent(p.board, tpl('BOARD.md', vars))) wrote.push('.agent/BOARD.md')
  if (writeIfAbsent(p.thread, tpl('THREAD.md', vars))) wrote.push('.agent/THREAD.md')
  if (writeIfAbsent(p.map, tpl('MAP.md', vars))) wrote.push('.agent/MAP.md')
  if (writeIfAbsent(p.ignore, tpl('.agentignore', vars))) wrote.push('.agent/.agentignore')
  // Greenfield has nothing to map, so the brief takes the map's place as the thing that says what
  // this project is. Non-goals is the load-bearing line: on an empty repo it is the only thing
  // stopping an agent from inventing scope.
  if (greenfield && writeIfAbsent(p.brief, tpl('BRIEF.md', vars))) wrote.push('.agent/BRIEF.md')
  // The SessionStart hook scaffolds with --quiet: its stdout is the agent's context, and the
  // project half of a repo that already opted in is all it needs.
  if (args.includes('--quiet')) return

  // The always-on rules, at the path each host already reads. These files belong to the user as
  // much as to us, so our text goes in a marked block and everything outside it is left alone.
  const body = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8')
  const cursorHeader = fs.readFileSync(path.join(TEMPLATES, 'rules', 'cursor-header.md'), 'utf8')
  // From templates/, not from this repo's own .gitattributes: that file is not in the npm
  // allowlist, so reading it worked from a git checkout and crashed from an installed package.
  const gitattributes = fs.readFileSync(path.join(TEMPLATES, 'gitattributes'), 'utf8')

  const managed = [
    ['AGENTS.md', body, 'html'],
    ['CLAUDE.md', body, 'html'],
    [path.join('.cursor', 'rules', 'godkit.mdc'), cursorHeader.trimEnd() + '\n\n' + body, 'html'],
    [path.join('.agents', 'rules', 'godkit.md'), body, 'html'],
    ['.gitattributes', gitattributes, 'hash'],
  ]
  const refused = []
  const rules = []
  for (const [rel, content, style] of managed) {
    const result = writeManaged(path.join(root, rel), content, style)
    const label = rel.replace(/\\/g, '/')
    if (result.action === 'refused') refused.push(label + ' — ' + result.reason)
    else if (result.action !== 'unchanged') {
      wrote.push(label + ' (' + result.action + ')')
      rules.push(label + (result.action === 'appended' ? ' (block added, your text kept)' : ''))
    }
  }

  const skills = args.includes('--no-skills') ? null : installProjectSkills(root)

  // The machine half, in the same command: hooks registered once per machine, and re-pointed when
  // a newer copy runs. `init` is re-run freely, so a machine already set up is left alone.
  let machine = null
  if (!args.includes('--no-install') && !machineReady()) machine = registerHooks('install', false)

  const ui = require('../lib/ui').create()
  if (!ui.on) {
    const kind = greenfield ? 'new project' : 'existing project, ' + code.count + (code.capped ? '+' : '') + ' code files'
    log('godkit: ' + name + ' (' + kind + ')')
    if (wrote.length) for (const w of wrote) log('  + ' + w)
    else log('  already set up — nothing to write')
    for (const r of refused) log('  ! ' + r)
    if (skills) log('  skills: ' + skills.names.length + ' -> .claude/skills .agents/skills')
    for (const r of (skills && skills.refused) || []) log('  ! skipped ' + r)
    for (const m of machine || []) log('  hooks ' + m.tool + ': ' + m.added + ' registered (' + m.file + ')')
    log('')
    if (greenfield) {
      log('Next: open your agent and describe what to build. It fills .agent/BRIEF.md from your')
      log('prompt and cuts the first sprint from it. No map yet: there is no code to map.')
    } else {
      log('Next: open your agent and give it a task. Its first session builds the map with the')
      log('godkit-map skill, then claims its scope on .agent/BOARD.md before it edits.')
    }
    return
  }

  const { c } = ui
  const total = require('../lib/install').HOOKS.length
  ui.header('godkit', version(), 'one shared brain for every AI agent')
  ui.kv('Project', c.bold(name))
  ui.kv('Detected', c.amber(ui.sym('spark')) + ' ' + (greenfield
    ? 'new project — no code yet'
    : 'existing project — ' + code.count + (code.capped ? '+' : '') + ' code files' + (code.top ? ' · ' + code.top.slice(1) : '')))
  ui.write()
  const agentFiles = ['BRIEF', 'BOARD', 'THREAD', 'MAP'].filter((f) => fs.existsSync(path.join(p.dir, f + '.md')))
  if (hadAgent) ui.row('skip', 'Memory', 'kept — .agent/ is never overwritten')
  else ui.row('ok', 'Memory', c.under('.agent/') + '  ' + agentFiles.concat('tasks', 'log').join(' · '))
  ui.row(rules.length ? 'ok' : 'skip', 'Rules', rules.length ? rules.join(' · ') : 'up to date')
  for (const r of refused) ui.row('warn', '', r)
  if (skills) {
    ui.row('ok', 'Skills', skills.names.length + ' installed   ' + c.under('.claude/skills') + '  ' + c.under('.agents/skills'))
    for (const r of skills.refused) ui.row('warn', '', 'skipped ' + r)
  }
  if (machine) ui.row('ok', 'Machine', machine.map((m) => m.tool + ' ' + m.added + '/' + total).join(' · ') + '   ' + c.dim(ROOT))
  else ui.row('skip', 'Machine', args.includes('--no-install') ? 'skipped (--no-install)' : 'already set up')
  ui.done('Ready', startedAt)
  ui.next(greenfield
    ? ['Open your AI agent here and describe what to build.', 'It writes the brief, plans and codes on its own.']
    : ['Open your AI agent and give it a task. The first session', 'maps the codebase automatically, then does the work.'])
}

function cmdInstall(args) {
  const want = args.filter((a) => !a.startsWith('-'))
  const dryRun = args.includes('--dry-run')
  const targets = want.length ? want : Object.keys(TOOLS)
  const names = skillNames()
  if (!names.length) {
    log('No skills found in ' + SKILLS)
    return
  }
  const { installOne } = require('../lib/install')

  for (const t of targets) {
    const spec = TOOLS[t]
    if (!spec) {
      log(t + ': unknown tool (known: ' + Object.keys(TOOLS).join(', ') + ')')
      continue
    }
    if (spec.style === 'rules-only') {
      log(t + ': rules only — `godkit init` writes .cursor/rules/godkit.mdc per project')
      continue
    }

    const { base, pairs } = skillPairs(spec, names)
    let done = 0
    const refused = []
    for (const [src, dest] of pairs) {
      const result = installOne(src, dest, dryRun)
      if (result.ok) done++
      else refused.push(path.basename(dest) + ' — ' + result.reason)
    }
    log(t + ': ' + (dryRun ? 'would install ' : 'installed ') + done + ' of ' + pairs.length + ' -> ' + base)
    // Refusing is the point: a directory we did not create is the user's, not ours to replace.
    for (const r of refused) log('   skipped ' + r)
    if (spec.hooks) log('   hooks: `godkit hooks install` registers them')
  }
}

// The hook registrations, as a first-class command instead of a path to hand-run.
function cmdHooks(args) {
  const action = args.find((a) => !a.startsWith('-')) || 'status'
  const dryRun = args.includes('--dry-run')
  const lib = require('../lib/install')

  if (action === 'status') {
    for (const [tool, file] of lib.settingsTargets()) {
      if (!fs.existsSync(file)) {
        log('  ' + tool.padEnd(8) + 'no settings file  (' + file + ')')
        continue
      }
      let record
      try {
        record = lib.readSettings(file)
      } catch (err) {
        log('  ' + tool.padEnd(8) + 'UNREADABLE — ' + err.message)
        continue
      }
      let found = 0
      for (const groups of Object.values((record.settings.hooks) || {})) {
        for (const group of groups || []) {
          for (const handler of (group && group.hooks) || []) if (lib.isOurHandler(handler)) found++
        }
      }
      log('  ' + tool.padEnd(8) + found + ' of ' + lib.HOOKS.length + ' godkit hooks registered  (' + file + ')')
    }
    log('')
    log('`godkit hooks install` / `godkit hooks uninstall` to change that.')
    return
  }

  if (action !== 'install' && action !== 'uninstall') {
    log('godkit hooks [status|install|uninstall] [--dry-run]')
    return
  }

  for (const r of registerHooks(action, dryRun)) {
    if (r.error) log('  ' + r.tool.padEnd(8) + 'skipped — ' + r.error)
    else log('  ' + r.tool.padEnd(8) + (dryRun ? 'would ' : '') + action + ': ' +
        r.added + ' registered, ' + r.removed + ' replaced  (' + r.file + ')')
  }
}

// Codex never read ~/.codex/settings.json; godkit 1.0 wrote its hooks there anyway. Any of ours
// found there are removed on every install or uninstall — the user's own entries are left alone.
function legacyTargets() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  return [['codex', path.join(home, 'settings.json')]]
}

function registerHooks(action, dryRun) {
  const lib = require('../lib/install')
  const results = []
  for (const [tool, file] of lib.settingsTargets()) {
    if (action === 'uninstall' && !fs.existsSync(file)) continue
    let record
    try {
      record = lib.readSettings(file)
    } catch (err) {
      results.push({ tool, file, error: err.message })
      continue
    }
    const result = lib.applyHooks(record.settings, { uninstall: action === 'uninstall', hooksDir: path.join(ROOT, 'hooks') })
    lib.writeSettings(file, result.settings, record, dryRun)
    results.push({ tool, file, added: result.added, removed: result.removed })
  }
  for (const [, file] of legacyTargets()) {
    if (!fs.existsSync(file)) continue
    try {
      const record = lib.readSettings(file)
      if (!countOurHooks(record.settings)) continue
      lib.writeSettings(file, lib.applyHooks(record.settings, { uninstall: true }).settings, record, dryRun)
    } catch {
      /* not ours to repair */
    }
  }
  return results
}

// The deterministic half of building the map: walk, categorize, resolve imports, group into
// batches. Writes scratch for the analysis pass to consume, and prints what it found.
function cmdScan(args) {
  const given = args.find((a) => !a.startsWith('-'))
  const root = given ? path.resolve(given) : projectRoot(process.cwd())
  const p = paths(root)
  const { scan } = require('../lib/scan')
  const { batch } = require('../lib/batch')

  const result = scan(root)
  const batches = batch(result)

  fs.mkdirSync(p.tmp, { recursive: true })
  fs.writeFileSync(path.join(p.tmp, 'scan.json'), JSON.stringify(result, null, 2) + '\n')
  fs.writeFileSync(path.join(p.tmp, 'batches.json'), JSON.stringify(batches, null, 2) + '\n')

  const byCat = {}
  for (const f of result.files) byCat[f.category] = (byCat[f.category] || 0) + 1

  log('scanned ' + result.count + ' files in ' + path.basename(root))
  log('  ' + Object.entries(byCat).map(([k, v]) => k + ' ' + v).join('  '))
  const langs = Object.entries(result.languages).sort((a, b) => b[1] - a[1]).slice(0, 6)
  if (langs.length) log('  ' + langs.map(([e, n]) => e + ' ' + n).join('  '))
  log('  ' + batches.length + ' batches -> .agent/tmp/batches.json')
  log('')
  log('Next: analyze each batch (see the godkit-map skill), then save the graph.')
}

// Save a merged graph as the project's map. Writes in a fixed order, because the order is the
// crash safety: meta.json last means an interrupted run reads as stale next time rather than
// being trusted as complete.
function cmdSave(args) {
  const root = projectRoot(process.cwd())
  const p = paths(root)
  const graphLib = require('../lib/graph')

  const given = args.find((a) => !a.startsWith('-'))
  const source = given ? path.resolve(given) : path.join(p.tmp, 'graph-merged.json')

  let incoming
  try {
    incoming = graphLib.readJson(source)
  } catch (err) {
    throw new Error('could not read ' + source + ': ' + err.message)
  }
  if (!incoming || !Array.isArray(incoming.nodes)) {
    throw new Error(
      'no graph at ' + source + '. Merge the batch output there first (see the godkit-map skill).',
    )
  }

  // Load-patch-save: keep whatever the existing map holds for files this pass did not touch.
  // loadGraph throws rather than reporting an existing non-empty file as empty, so a bad parse
  // can never quietly reset the memory.
  const existing = graphLib.loadGraph(p.graph)
  let merged = incoming
  if (existing && !args.includes('--replace')) {
    const touched = new Set(incoming.nodes.map((n) => n.filePath).filter(Boolean))
    // A node for a file that is gone survives every partial refresh otherwise: the pass has
    // nothing to report about a deleted file, so `touched` never names it and the stale node is
    // kept forever. Existence on disk is the only honest test.
    const keptNodes = existing.nodes.filter((n) => {
      if (!n.filePath) return true
      if (touched.has(n.filePath)) return false
      return fs.existsSync(path.resolve(root, n.filePath))
    })
    const keptIds = new Set([...keptNodes, ...incoming.nodes].map((n) => n.id))
    merged = {
      project: Object.assign({}, existing.project, incoming.project),
      nodes: keptNodes.concat(incoming.nodes),
      edges: existing.edges
        .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
        .concat(incoming.edges || []),
      layers: (incoming.layers && incoming.layers.length ? incoming.layers : existing.layers) || [],
      tour: (incoming.tour && incoming.tour.length ? incoming.tour : existing.tour) || [],
    }
  }

  const { git } = require('../lib/paths')
  const sha = git(['rev-parse', 'HEAD'], root)
  merged.project = Object.assign({ name: path.basename(root) }, merged.project, {
    generatedAt: new Date().toISOString(),
    sha,
  })

  // Fixed order, and each write is a temp-and-rename. The order is the crash safety: meta.json
  // last means an interrupted run reads as stale next time rather than being trusted as complete.
  const saved = graphLib.saveGraph(p.graph, merged, root)
  graphLib.atomicWriteFile(p.map, graphLib.renderMap(saved))
  graphLib.atomicWriteFile(
    p.meta,
    JSON.stringify(
      { version: graphLib.VERSION, sha, generatedAt: saved.project.generatedAt, nodes: saved.nodes.length },
      null,
      2,
    ) + '\n',
  )

  // Move scratch aside rather than deleting it: reversible, and it never trips a gate.
  // Bucketed by day, not by millisecond — rebuilding the map five times should leave one
  // recoverable copy, not five directories.
  try {
    if (fs.existsSync(p.tmp)) {
      const bucket = path.join(p.dir, '.trash-' + new Date().toISOString().slice(0, 10))
      fs.rmSync(bucket, { recursive: true, force: true }) // today's earlier scratch is already trash
      fs.renameSync(p.tmp, bucket)
    }
  } catch {
    /* scratch is disposable; a locked file must not fail the save */
  }

  const WEEK = 7 * 24 * 3600 * 1000
  for (const entry of fs.readdirSync(p.dir)) {
    if (!entry.startsWith('.trash-')) continue
    const stamp = Date.parse(entry.slice(7))
    if (Number.isNaN(stamp) || Date.now() - stamp > WEEK) {
      fs.rmSync(path.join(p.dir, entry), { recursive: true, force: true })
    }
  }

  log('saved: ' + saved.nodes.length + ' nodes, ' + saved.edges.length + ' edges, ' +
      saved.layers.length + ' layers @ ' + (sha ? sha.slice(0, 8) : 'no-git'))
  log('  .agent/graph.json, .agent/MAP.md, .agent/meta.json')
}

// Project-local skills: the ones this project keeps for itself in .agent/skills/, as opposed to
// the ones this package ships. Reports them, and links them into the paths hosts actually read.
function cmdSkills(args) {
  const root = projectRoot(process.cwd())
  const evolve = require('../lib/evolve')
  const tools = args.filter((a) => !a.startsWith('-'))
  const force = args.includes('--force')
  const mode = evolve.getEvolveMode()

  const skills = evolve.listSkills(root)
  if (!skills.length) {
    log('no project skills in .agent/skills/')
    log('')
    log('A project skill is a procedure this repo keeps for itself — a fixture reset, a release')
    log('check. Write one with the godkit-evolve skill, or by hand as')
    log('.agent/skills/<name>/SKILL.md.')
    return
  }

  if (args.includes('--link') || args.includes('--unlink')) {
    const unlink = args.includes('--unlink')
    const results = unlink
      ? evolve.unlinkProjectSkills(root, { tools })
      : evolve.linkProjectSkills(root, { tools, force, mode })

    if (!results.length) {
      log(unlink ? 'nothing linked to remove' : 'nothing to link')
      return
    }
    for (const r of results) {
      const where = r.tool ? ' -> ' + r.tool : ''
      log('  ' + (r.ok ? r.how : r.how.toUpperCase()) + '  ' + r.skill + where + (r.reason ? ' — ' + r.reason : ''))
    }
    if (!unlink && results.some((r) => r.how === 'copied')) {
      log('')
      log('copied, not linked — re-run `godkit skills --link` after editing those skills')
    }
    return
  }

  log('project skills (.agent/skills/) — mode ' + mode)
  log('')
  for (const skill of skills) {
    const findings = evolve.scanSkill(skill)
    const linked = evolve.linkedTools(root, skill)
    const flags = []
    if (!skill.enabled) flags.push('disabled')
    if (evolve.blocked(findings)) flags.push('BLOCKED')
    log(
      '  ' + skill.name.padEnd(28) + skill.origin.padEnd(10) +
        (linked.length ? linked.join(' ') : '—') + (flags.length ? '  [' + flags.join(' ') + ']' : ''),
    )
    for (const f of findings) {
      if (f.level !== 'block') continue
      log('      ' + f.level + ' ' + f.rule + ' SKILL.md:' + f.line + ' — ' + f.text)
    }
  }
  log('')
  log('`godkit skills --link` to make them visible to claude and codex.')
}

// Re-read the log stream and say what it implies about each project skill. Derives everything;
// --write projects it to .agent/SKILLS.md, which is what the hosts with no hooks read.
function cmdEvolve(args) {
  const root = projectRoot(process.cwd())
  const p = paths(root)
  const evolve = require('../lib/evolve')
  const rep = evolve.report(root)

  // No skills yet is exactly when capture candidates matter most, so this reports and keeps
  // going rather than returning early.
  if (!rep.skills.length) {
    log('no project skills in .agent/skills/ yet — see the godkit-evolve skill')
  } else {
    log('project skills — mode ' + rep.mode)
  }
  log('')
  for (const r of rep.skills) {
    const e = r.evidence
    log(
      '  ' + r.skill.name.padEnd(26) +
        (r.trust === evolve.TRUST.QUARANTINED ? 'QUARANTINED' : r.trust).padEnd(13) +
        'ok ' + e.successes + '  bad ' + e.failures + '  sessions ' + e.sessions.length +
        (r.linked.length ? '  [' + r.linked.join(' ') + ']' : '  [not linked]'),
    )
    for (const f of r.findings) {
      if (f.level === 'block') log('      BLOCK ' + f.rule + ' SKILL.md:' + f.line)
    }
    for (const b of e.blamedIn) log('      blamed in ' + path.basename(b))
  }

  if (rep.candidates.length) {
    log('')
    log('capture candidates:')
    for (const c of rep.candidates) {
      log('  ' + c.sessions + ' sessions — ' + c.shared.join(' '))
      for (const f of c.logs) log('      ' + path.basename(f))
    }
  }

  // Always report the coverage gap. A system that hides how much of its own input it cannot see
  // is worse than one with a visible gap.
  const missing = rep.coverage.total - rep.coverage.attributed
  log('')
  log(missing + ' of ' + rep.coverage.total + ' log entries carried no `skills:` frontmatter')
  log('trust = used, and those sessions finished verified. A correlation, not a quality score.')

  if (args.includes('--write')) {
    fs.mkdirSync(path.dirname(p.skillsDoc), { recursive: true })
    fs.writeFileSync(p.skillsDoc, evolve.renderSkillsDoc(root, rep))
    log('')
    log('wrote .agent/SKILLS.md')
  }
}

// Where the log stream says the code hurts. The deterministic half of godkit-refactor: this
// ranks files, the skill reads them and decides what — if anything — to actually change.
function cmdRefactor(args) {
  const root = projectRoot(process.cwd())
  const rep = require('../lib/hotspots').report(root)

  if (!rep.ok) {
    log('godkit refactor: ' + rep.reason)
    return
  }

  if (!rep.files.length) {
    log('no code files named across ' + rep.logs + ' log entries — nothing to rank yet')
    return
  }

  const limitFlag = args.indexOf('--all') === -1 ? 15 : rep.files.length
  log('hotspots — code files, over ' + rep.logs + ' log entries')
  log('')
  log('  ' + 'score'.padEnd(7) + 'file'.padEnd(34) + 'touched  blamed  sessions  fan-in')
  for (const f of rep.files.slice(0, limitFlag)) {
    log(
      '  ' + String(f.score).padEnd(7) + f.file.padEnd(34) +
        String(f.touched).padEnd(9) + String(f.blamed).padEnd(8) +
        String(f.sessions).padEnd(10) + f.fanIn,
    )
  }
  if (rep.files.length > limitFlag) {
    log('')
    log('  ' + (rep.files.length - limitFlag) + ' more — `--all` for the rest')
  }

  log('')
  log('score = blamed x2 + touched. Evidence of churn and blame, not of bad code —')
  log('read the files before you believe the ranking. See the godkit-refactor skill.')
}

// A sprint is a goal plus waves of file-disjoint tasks. The CLI only does what a machine can do:
// create the file, resolve the task ids the wave table names, and refuse to close while any of
// them is unfinished. Cutting the waves is judgment — that lives in the godkit skill.
function cmdSprint(args) {
  const root = projectRoot(process.cwd())
  const p = paths(root)
  const sprint = require('../lib/sprint')
  const action = args.find((a) => !a.startsWith('-'))

  if (action === 'new') {
    const goal = args.slice(args.indexOf('new') + 1).filter((a) => !a.startsWith('-')).join(' ').trim()
    if (!goal) {
      log('godkit sprint new "<goal>" — a sprint without a goal is a list, not a sprint')
      process.exitCode = 1
      return
    }
    fs.mkdirSync(p.sprints, { recursive: true })
    const id = sprint.nextId(p.dir)
    const file = path.join(p.sprints, id + '.md')
    writeIfAbsent(file, tpl('sprint.md', { ID: id, GOAL: goal, UTC: utcStamp() }))
    log(id + ' opened — .agent/sprints/' + id + '.md')
    log('  ' + goal)
    log('')
    log('Next: cut the goal into waves of file-disjoint tasks, write each as .agent/tasks/T-NNN-*.md,')
    log('and name their ids in the wave table. Two tasks that share a file go in different waves.')
    return
  }

  const open = sprint.current(p.dir)
  if (!open) {
    log('no sprints in .agent/sprints/ — `godkit sprint new "<goal>"` opens one')
    return
  }

  if (action === 'close') {
    const blockers = sprint.blockers(p.dir, open)
    if (blockers.length) {
      log(open.id + ': cannot close — ' + blockers.length + ' blocker' + (blockers.length === 1 ? '' : 's'))
      for (const b of blockers) log('  ' + b)
      process.exitCode = 1
      return
    }
    require('../lib/graph').atomicWriteFile(open.file, sprint.close(p.dir, open))
    log(open.id + ' closed — every task done, every one with evidence.')
    return
  }

  log(open.id + '  ' + open.status + '  ' + open.goal)
  log('')
  const rows = sprint.tasks(p.dir, open)
  if (!rows.length) {
    log('  no tasks named in the wave table yet')
    return
  }
  log('  ' + 'task'.padEnd(9) + 'owner'.padEnd(20) + 'phase'.padEnd(10) + 'state')
  for (const t of rows) {
    if (t.missing) {
      log('  ' + t.id.padEnd(9) + '—'.padEnd(20) + '—'.padEnd(10) + 'NO TASK FILE')
      continue
    }
    const state = t.findings.length ? t.findings.map((f) => f.tag).join(' ') : t.phase === 'done' ? 'proven' : 'ok'
    log('  ' + t.id.padEnd(9) + t.owner.padEnd(20) + t.phase.padEnd(10) + state)
  }
  const blockers = sprint.blockers(p.dir, open)
  log('')
  log(blockers.length ? blockers.length + ' blocker(s) — `godkit sprint close` lists them' : 'closeable — `godkit sprint close`')
}

function cmdVerify(args) {
  const root = projectRoot(process.cwd())
  const p = paths(root)
  if (!fs.existsSync(p.dir)) {
    log('no .agent/ here — run `godkit init` first')
    return
  }

  const findings = require('../lib/contract').checkAll(root)
  const quiet = args.includes('--quiet')

  if (!quiet) for (const f of findings) log(f.label + ': ' + f.tag + ' - ' + f.message)

  if (!findings.length) {
    log('tasks: clean.')
    return
  }
  // Every rule here is a resume blocker: without an exit, evidence or handoff the next agent
  // cannot safely start. Non-zero so a hook or CI can stop on it.
  if (!quiet) log('')
  log('tasks: ' + findings.length + ' finding' + (findings.length === 1 ? '' : 's') + ' - all blocking.')
  process.exitCode = 1
}

function cmdDoctor() {
  const root = projectRoot(process.cwd())
  const p = paths(root)
  const ui = require('../lib/ui').create()
  if (ui.on) ui.header('godkit', version(), path.basename(root))
  else log('godkit ' + version())
  log('project: ' + root)
  log('')

  const has = fs.existsSync(p.dir)
  log('  .agent/          ' + (has ? 'present' : 'MISSING — run `godkit init`'))
  if (has) {
    for (const [label, file] of [
      ['BOARD.md', p.board],
      ['THREAD.md', p.thread],
      ['MAP.md', p.map],
      ['graph.json', p.graph],
    ].concat(fs.existsSync(p.brief) ? [['BRIEF.md', p.brief]] : [])) {
      log('    ' + label.padEnd(14) + (fs.existsSync(file) ? 'ok' : 'missing'))
    }
    try {
      // A greenfield project has no code yet, so "MISSING" is a false alarm — the brief is
      // standing in for the map until there is something to map.
      if (fs.existsSync(p.brief) && !fs.existsSync(p.graph)) {
        // ...until the first wave lands code. From then on a missing map is a real gap.
        if (require('../lib/scan').codeCount(root, 1).count) log('    map          MISSING — code exists now; run the godkit-map skill')
        else log('    map          greenfield — no code to map yet (.agent/BRIEF.md is the brief)')
      } else {
        const { staleness, summary } = require('../lib/freshness')
        log('    map          ' + summary(staleness(root, p.meta)))
      }
    } catch (err) {
      log('    map          could not check (' + err.message + ')')
    }
    try {
      const n = fs.readdirSync(p.log).filter((f) => f.endsWith('.md')).length
      log('    log entries  ' + n)
    } catch {
      log('    log entries  0')
    }
    try {
      const { checkAll, taskEntries } = require('../lib/contract')
      const total = taskEntries(p.dir).length
      const bad = new Set(checkAll(root).filter((f) => f.kind === 'task').map((f) => f.label)).size
      log('    tasks        ' + total + (bad ? ' (' + bad + ' unproven - run `godkit verify`)' : total ? ', all proven' : ''))
    } catch (err) {
      log('    tasks        could not check (' + err.message + ')')
    }

    const evolve = require('../lib/evolve')
    const projectSkills = evolve.listSkills(root)
    if (projectSkills.length) {
      const unlinked = projectSkills.filter((s) => !evolve.linkedTools(root, s).length).length
      const bad = projectSkills.filter((s) => evolve.blocked(evolve.scanSkill(s))).length
      log('    project skills ' + projectSkills.length +
          (unlinked ? ', ' + unlinked + ' not linked (`godkit skills --link`)' : ', all linked') +
          (bad ? ', ' + bad + ' BLOCKED by the safety scan' : ''))
    }
  }

  log('')
  const names = skillNames()
  log('  skills in package: ' + names.length)
  for (const dir of PROJECT_SKILL_DIRS) {
    const n = names.filter((x) => fs.existsSync(path.join(root, ...dir, x, 'SKILL.md'))).length
    log('  ' + dir.join('/').padEnd(15) + n + ' of ' + names.length + (n < names.length ? ' — `godkit init` copies them' : ''))
  }
  for (const [t, spec] of Object.entries(TOOLS)) {
    if (spec.style === 'rules-only') {
      const f = path.join(root, '.cursor', 'rules', 'godkit.mdc')
      log('  ' + t.padEnd(13) + (fs.existsSync(f) ? 'rules installed' : 'rules missing'))
      continue
    }
    const base = path.join(os.homedir(), ...spec.dir)
    const probe = spec.style === 'folder' ? path.join(base, 'godkit') : path.join(base, names[0] || 'godkit')
    log('  ' + t.padEnd(13) + (fs.existsSync(probe) ? 'installed' : 'not installed') + '  (' + base + ')')
  }

  // Hooks are the half that fails silently: skills present but hooks unregistered means no brief,
  // no work tracking and no clockout, with nothing on screen to say so.
  log('')
  log('  hooks:')
  cmdHooks([])
}

// Search everything agents ever wrote, archive included, in a bounded answer. This is how an
// agent remembers what happened to a file without reading the whole history into its context.
function cmdRecall(args) {
  const root = projectRoot(process.cwd())
  const query = args.filter((a) => !a.startsWith('-')).join(' ').trim()
  if (!query) {
    log('godkit recall <file|words> — every word must appear on the line; newest first')
    process.exitCode = 1
    return
  }
  const { recall } = require('../lib/memory')
  const result = recall(root, query)
  const ui = require('../lib/ui').create()
  if (!result.hits.length) {
    log('no matches for "' + query + '" in .agent/ (logs, board, thread, tasks, archive)')
    return
  }
  if (!ui.on) {
    process.stdout.write(result.text)
    if (result.more) log('+' + result.more + ' more — narrow the query')
    return
  }
  const { c } = ui
  ui.write()
  ui.write('  ' + c.amber(ui.sym('mark')) + ' ' + c.bold(c.cyan('recall')) + '  ' + query + '   ' +
    c.dim(result.hits.length + (result.more ? '+' + result.more : '') + ' matches · newest first'))
  ui.write()
  for (const h of result.hits) {
    ui.write('  ' + c.dim(h.file + ':' + h.line))
    ui.write('    ' + h.text)
  }
  ui.write()
}

function cmdUninstall(args) {
  const targets = args.filter((a) => !a.startsWith('-'))
  const dryRun = args.includes('--dry-run')
  const names = skillNames()
  const { removeOne } = require('../lib/install')

  // --project: the copies `init` put into this project. Only marked godkit copies are removed.
  if (args.includes('--project')) {
    const root = projectRoot(process.cwd())
    for (const dir of PROJECT_SKILL_DIRS) {
      let removed = 0
      const kept = []
      for (const n of names) {
        const result = removeOne(path.join(root, ...dir, n), path.join(SKILLS, n), dryRun)
        if (result.how === 'absent') continue
        if (result.ok) removed++
        else kept.push(n)
      }
      log(dir.join('/') + ': ' + (dryRun ? 'would remove ' : 'removed ') + removed)
      if (kept.length) log('   kept (not ours): ' + kept.join(', '))
    }
    return
  }

  for (const t of targets.length ? targets : Object.keys(TOOLS)) {
    const spec = TOOLS[t]
    if (!spec || spec.style === 'rules-only') continue
    const { base, pairs } = skillPairs(spec, names)
    let removed = 0
    const kept = []
    for (const [src, dest] of pairs) {
      const result = removeOne(dest, src, dryRun)
      if (result.how === 'absent') continue
      if (result.ok) removed++
      else kept.push(path.basename(dest))
    }
    log(t + ': ' + (dryRun ? 'would remove ' : 'removed ') + removed + ' entries from ' + base)
    if (kept.length) log('   kept (not ours): ' + kept.join(', '))
  }
  log('')
  log('Left in place: this project\'s .agent/ directory and rule files. Delete them by hand if')
  log('you want them gone — they are your project\'s memory, not the package\'s.')
  log('Skill copies inside this project: `godkit uninstall --project`.')
  log('Project skills linked into .claude/ or .agents/: `godkit skills --unlink`.')
}

const COMMANDS = [
  ['SETUP', null, [
    ['init [path] [--new]', 'set up this project · auto-detects new vs existing'],
    ['doctor', 'health check: what is set up, what is stale'],
  ]],
  ['MEMORY', null, [
    ['recall <file|words>', 'search all history — logs, board, thread, archive'],
    ['verify [--quiet]', 'are "done" claims backed by evidence? non-zero if not'],
  ]],
  ['WORK', 'your agent runs these itself', [
    ['sprint [new "<goal>"|close]', 'a goal and its waves of file-disjoint tasks'],
    ['scan · save', 'build the project map (godkit-map)'],
    ['skills [--link|--unlink]', 'this project\'s own skills in .agent/skills/'],
    ['evolve [--write]', 'what each project skill\'s evidence says'],
    ['refactor [--all]', 'which code files churn and get blamed most'],
  ]],
  ['MACHINE', null, [
    ['hooks [status|install|uninstall]', 'hook registrations for claude and codex'],
    ['install [tool...]', 'skills into ~/ for every project (init already covers this one)'],
    ['uninstall [tool|--project]', 'remove skills godkit placed; never touches .agent/'],
    ['--version', 'the installed version'],
  ]],
]

function help(stream) {
  const out = stream || process.stdout
  const ui = require('../lib/ui').create(out)
  const { c } = ui
  if (ui.on) ui.header('godkit', version(), 'install once, then just prompt your agent')
  else ui.write('godkit ' + version() + ' — install once, then just prompt your agent\n')
  for (const [group, note, rows] of COMMANDS) {
    ui.write('  ' + c.bold(group) + (note ? '  ' + c.dim('(' + note + ')') : ''))
    for (const [cmd, what] of rows) ui.write('    ' + c.cyan(cmd.padEnd(34)) + c.dim(what))
    ui.write()
  }
}

// init, install and hooks write paths meant to outlive this process. Run from npx, this process
// lives in a cache npm prunes at will — so those three re-run from the stable copy instead.
function fromStableHome(cmd, args) {
  if (!['init', 'install', 'hooks'].includes(cmd)) return false
  const stable = require('../lib/install').stableRoot(version())
  if (path.resolve(stable) === ROOT) return false
  const { execFileSync } = require('child_process')
  try {
    execFileSync(process.execPath, [path.join(stable, 'bin', 'godkit.js'), cmd, ...args], { stdio: 'inherit' })
  } catch (err) {
    process.exitCode = err.status || 1
  }
  return true
}

function main() {
  const [cmd, ...args] = process.argv.slice(2)
  if (fromStableHome(cmd, args)) return
  switch (cmd) {
    case 'init':
      return cmdInit(args)
    case 'install':
      return cmdInstall(args)
    case 'scan':
      return cmdScan(args)
    case 'save':
      return cmdSave(args)
    case 'sprint':
      return cmdSprint(args)
    case 'skills':
      return cmdSkills(args)
    case 'evolve':
      return cmdEvolve(args)
    case 'refactor':
      return cmdRefactor(args)
    case 'hooks':
      return cmdHooks(args)
    case 'recall':
      return cmdRecall(args)
    case 'verify':
      return cmdVerify(args)
    case 'doctor':
      return cmdDoctor()
    case 'uninstall':
      return cmdUninstall(args)
    case 'version':
    case '--version':
    case '-v':
      return log(version())
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return help()
    default:
      process.stderr.write('godkit: unknown command "' + cmd + '"\n\n')
      help(process.stderr)
      process.exit(1)
  }
}

try {
  main()
} catch (err) {
  process.stderr.write('godkit: ' + (err && err.message) + '\n')
  process.exit(1)
}
