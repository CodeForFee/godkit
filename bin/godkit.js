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

// Symlinks need elevation on Windows, junctions do not. Copy is the last resort so that a
// non-admin install still works — it just will not track edits to the package.
function link(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  try {
    const st = fs.lstatSync(dest)
    if (st.isSymbolicLink() || st.isDirectory()) fs.rmSync(dest, { recursive: true, force: true })
  } catch {
    /* not there yet */
  }
  try {
    fs.symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir')
    return 'linked'
  } catch {
    fs.cpSync(src, dest, { recursive: true })
    return 'copied'
  }
}

function cmdInit(args) {
  const root = args[0] ? path.resolve(args[0]) : projectRoot(process.cwd())
  const p = paths(root)
  const name = path.basename(root)
  const vars = { PROJECT: name, UTC: utcStamp() }

  fs.mkdirSync(p.tasks, { recursive: true })
  fs.mkdirSync(p.log, { recursive: true })

  const wrote = []
  if (writeIfAbsent(p.board, tpl('BOARD.md', vars))) wrote.push('.agent/BOARD.md')
  if (writeIfAbsent(p.thread, tpl('THREAD.md', vars))) wrote.push('.agent/THREAD.md')
  if (writeIfAbsent(p.map, tpl('MAP.md', vars))) wrote.push('.agent/MAP.md')
  if (writeIfAbsent(p.ignore, tpl('.agentignore', vars))) wrote.push('.agent/.agentignore')

  // The always-on rules, at the path each host already reads.
  const body = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8')
  const cursorHeader = fs.readFileSync(path.join(TEMPLATES, 'rules', 'cursor-header.md'), 'utf8')
  const rules = [
    ['AGENTS.md', body],
    ['CLAUDE.md', body],
    [path.join('.cursor', 'rules', 'godkit.mdc'), cursorHeader.trimEnd() + '\n\n' + body],
    [path.join('.agents', 'rules', 'godkit.md'), body],
  ]
  for (const [rel, content] of rules) {
    if (writeIfAbsent(path.join(root, rel), content)) wrote.push(rel.replace(/\\/g, '/'))
  }

  log('godkit: ' + name)
  if (wrote.length) for (const w of wrote) log('  + ' + w)
  else log('  already set up — nothing to write')
  log('')
  log('Next: run the godkit-map skill to build the project map, then claim your scope on')
  log('.agent/BOARD.md before you edit.')
}

function cmdInstall(args) {
  const want = args.filter((a) => !a.startsWith('-'))
  const targets = want.length ? want : Object.keys(TOOLS)
  const names = skillNames()
  if (!names.length) {
    log('No skills found in ' + SKILLS)
    return
  }

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

    const base = path.join(os.homedir(), ...spec.dir)
    if (spec.style === 'folder') {
      const how = link(SKILLS, path.join(base, 'godkit'))
      log(t + ': ' + how + ' ' + names.length + ' skills -> ' + path.join(base, 'godkit'))
    } else {
      let how = ''
      for (const n of names) how = link(path.join(SKILLS, n), path.join(base, n))
      log(t + ': ' + how + ' ' + names.length + ' skills -> ' + base)
    }
    if (spec.hooks) {
      log('   hooks: run `node ' + path.join(ROOT, 'hooks', 'install.js') + '` to register them')
    }
  }
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
    const keptNodes = existing.nodes.filter((n) => !n.filePath || !touched.has(n.filePath))
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

  const saved = graphLib.saveGraph(p.graph, merged, root)
  fs.writeFileSync(p.map, graphLib.renderMap(saved))
  fs.writeFileSync(
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

function cmdDoctor() {
  const root = projectRoot(process.cwd())
  const p = paths(root)
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
    ]) {
      log('    ' + label.padEnd(14) + (fs.existsSync(file) ? 'ok' : 'missing'))
    }
    try {
      const { staleness, summary } = require('../lib/freshness')
      log('    map          ' + summary(staleness(root, p.meta)))
    } catch (err) {
      log('    map          could not check (' + err.message + ')')
    }
    try {
      const n = fs.readdirSync(p.log).filter((f) => f.endsWith('.md')).length
      log('    log entries  ' + n)
    } catch {
      log('    log entries  0')
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
}

function cmdUninstall(args) {
  const targets = args.filter((a) => !a.startsWith('-'))
  const names = skillNames()
  for (const t of targets.length ? targets : Object.keys(TOOLS)) {
    const spec = TOOLS[t]
    if (!spec || spec.style === 'rules-only') continue
    const base = path.join(os.homedir(), ...spec.dir)
    const victims = spec.style === 'folder' ? [path.join(base, 'godkit')] : names.map((n) => path.join(base, n))
    let n = 0
    for (const v of victims) {
      try {
        fs.rmSync(v, { recursive: true, force: true })
        n++
      } catch {
        /* already gone */
      }
    }
    log(t + ': removed ' + n + ' entries from ' + base)
  }
  log('')
  log('Left in place: this project\'s .agent/ directory and rule files. Delete them by hand if')
  log('you want them gone — they are your project\'s memory, not the package\'s.')
  log('Project skills linked into .claude/ or .agents/: `godkit skills --unlink`.')
}

const HELP = `godkit — one shared harness for every AI agent

  godkit init [path]        scaffold .agent/ and the per-tool rule files into a project
  godkit install [tool...]  install the skills for claude, codex, antigravity (default: all)
  godkit scan [path]        walk the project and group it into batches for the map
  godkit save [file]        save a merged graph as the map (graph.json, MAP.md, meta.json)
  godkit skills [--link|--unlink] [tool...] [--force]
                            this project's own skills in .agent/skills/: list them, or link
                            them into the paths claude and codex read
  godkit doctor             what is set up here, and whether the map is stale
  godkit uninstall [tool]   remove the installed skills (leaves your .agent/ alone)

After init, run the godkit-map skill to build the project map.
`

function main() {
  const [cmd, ...args] = process.argv.slice(2)
  switch (cmd) {
    case 'init':
      return cmdInit(args)
    case 'install':
      return cmdInstall(args)
    case 'scan':
      return cmdScan(args)
    case 'save':
      return cmdSave(args)
    case 'skills':
      return cmdSkills(args)
    case 'doctor':
      return cmdDoctor()
    case 'uninstall':
      return cmdUninstall(args)
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return process.stdout.write(HELP)
    default:
      process.stderr.write('godkit: unknown command "' + cmd + '"\n\n' + HELP)
      process.exit(1)
  }
}

try {
  main()
} catch (err) {
  process.stderr.write('godkit: ' + (err && err.message) + '\n')
  process.exit(1)
}
