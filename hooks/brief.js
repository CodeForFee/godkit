#!/usr/bin/env node
'use strict'
// SessionStart: inject a bounded, no-follow digest of the canonical shared state. The budget is a
// constant, not a fraction of the history: however long the project has run, this costs the same.
// Live work (claims, open bugs, decisions) is quoted; finished work is a one-line pointer, and
// `godkit recall` reaches everything else.

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CLI = 'node "' + path.join(ROOT, 'bin', 'godkit.js').replace(/\\/g, '/') + '"'
const MAX_BRIEF = 3 * 1024
const LIMITS = {
  board: 1300,
  map: 600,
  logs: 550,
  thread: 300,
  notes: 400,
}
const LOGS_SHOWN = 5

const REMINDER =
  'Claim your scope on the board before you edit; never edit inside an open claim. Sign claims ' +
  'and logs with your exact model id, not the tool name. Log before you finish. ' +
  'History: `godkit recall <file|words>`. CLI: ' + CLI

function clippedRead(agentDir, file, limit, tail) {
  const { fitBytes, readContained } = require('../lib/paths')
  const result = readContained(agentDir, file, 64 * 1024, tail)
  if (!result) return null
  return fitBytes(result.text.trim(), limit, tail)
}

// The board, minus what does not bind anyone: the roster, fixed bugs, and older handoffs.
function boardDigest(text) {
  const out = []
  let keep = true
  let section = ''
  let handoffs = 0
  let prevKept = false
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^# /.test(line)) continue
    if (/^## /.test(line)) {
      section = line.toLowerCase()
      keep = !/roster|open notes/.test(section)
      handoffs = 0
      if (keep) out.push(line)
      continue
    }
    if (!keep || /^<!--.*-->$/.test(line.trim()) || !line.trim()) {
      prevKept = false
      continue
    }
    if (/^## bugs/.test(section) && /^\s*[-*] \[x\]/i.test(line)) {
      prevKept = false
      continue
    }
    if (/handoff/.test(section)) {
      if (/^[-*] /.test(line)) handoffs++
      if (handoffs > 1) {
        prevKept = false
        continue
      }
    }
    if (/^\s*\|[\s|-]*\|\s*$/.test(line)) continue // table separator rows
    if (/^## tasks/.test(section) && /\|\s*done\s*\|/i.test(line)) continue
    // Structure only — rows, bullets, the sprint line. The prose between them explains the board
    // to a first-time reader, and every session after the first pays for it.
    const continues = /^\s{2,}\S/.test(line) && prevKept // a wrapped bullet travels with it
    prevKept = continues || /^\s*(\||[-*] |\d+\. |\*\*)/.test(line)
    if (!prevKept) continue
    out.push(line)
  }
  // Headings left with nothing under them say nothing.
  return out.filter((line, i) => !/^## /.test(line) || (out[i + 1] && !/^## /.test(out[i + 1]))).join('\n')
}

function field(body, name) {
  const frontmatter = String(body || '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatter) return null
  const match = frontmatter[1].match(new RegExp('^' + name + ':\\s*(.+)$', 'mi'))
  return match ? match[1].replace(/\s+#.*$/, '').replace(/^"|"$/g, '').trim() : null
}

function logLine(agentDir, file) {
  const { readContained } = require('../lib/paths')
  const body = (readContained(agentDir, file, 4096, false) || {}).text || ''
  const task = (body.match(/## Task\s*\r?\n+([^\r\n<#][^\r\n]*)/) || [])[1]
  const bits = [field(body, 'agent'), field(body, 'status'), field(body, 'scope')].filter(Boolean)
  return '- ' + path.basename(file, '.md').slice(0, 16) + ' ' + bits.join(' · ') + (task ? ' — ' + task.trim() : '')
}

function unfilled(text, heading) {
  const m = String(text || '').match(new RegExp('## ' + heading + '\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)'))
  return !m || !m[1].replace(/<!--[\s\S]*?-->/g, '').trim()
}

function mapState(context, p) {
  const { containedPath } = require('../lib/paths')
  const hasCode = () => require('../lib/scan').codeCount(context.worktreeRoot, 1).count > 0
  if (fs.existsSync(p.brief) && !fs.existsSync(p.graph)) {
    const brief = clippedRead(context.agentDir, p.brief, 16 * 1024, false) || ''
    if (!hasCode()) {
      return unfilled(brief, 'What this is')
        ? 'NEW PROJECT. FIRST STEP, even for a one-turn build: fill .agent/BRIEF.md from the ' +
          'user\'s prompt yourself — a line or two per section; infer the stack, ask only if nothing ' +
          'hints at it and it is hard to reverse. Do not ask the user to fill it. Then build; open ' +
          '`godkit sprint new "<goal>"` only if the build is bigger than one turn.'
        : 'New project, brief filled, no code yet — work the open sprint.\n' + (brief.slice(0, 400))
    }
    return 'MAP MISSING — code exists now. Run the godkit-map skill before relying on your own reading.'
  }
  const lines = []
  try {
    if (!fs.existsSync(p.meta) || containedPath(context.agentDir, p.meta, 'file')) {
      const { staleness, summary } = require('../lib/freshness')
      const state = staleness(context.worktreeRoot, p.meta)
      lines.push(summary(state))
      if (state.state === 'stale' && state.changed.length) {
        lines.push('Changed: ' + state.changed.slice(0, 8).join(', '))
        lines.push('Refresh with godkit-map before relying on this map.')
      }
    } else lines.push('map freshness unavailable: unsafe .agent/meta.json was ignored')
  } catch (error) {
    lines.push('map freshness unavailable: ' + error.message)
  }
  if (!fs.existsSync(p.graph)) lines.push('No map yet — run the godkit-map skill first.')
  else {
    const map = clippedRead(context.agentDir, p.map, LIMITS.map, false)
    if (map) lines.push(map.replace(/<!--[\s\S]*?-->\s*/g, ''))
  }
  return lines.join('\n')
}

// Pointers the agent acts on after its task, read from files already written — no recompute here.
function notes(context, p) {
  const out = []
  const doc = clippedRead(context.agentDir, p.skillsDoc, 8192, false)
  if (doc) {
    const candidates = (doc.match(/^## Capture candidates[\s\S]*?(?=^## |$(?![\s\S]))/m) || [''])[0]
      .split(/\r?\n/).filter((l) => /^\s*[-*] /.test(l)).length
    const quarantined = (doc.match(/QUARANTINED/g) || []).length
    if (candidates) out.push('evolve: ' + candidates + ' capture candidate(s) — run godkit-evolve AFTER your task.')
    if (quarantined) out.push('evolve: ' + quarantined + ' project skill(s) QUARANTINED — see .agent/SKILLS.md.')
  }
  const { containedEntries } = require('../lib/paths')
  const skills = containedEntries(context.agentDir, p.skills, 64).filter((e) => e.isDirectory && !e.name.startsWith('.'))
  if (skills.length) out.push('Project skills (.agent/skills/): ' + skills.map((e) => e.name).join(', ') + '. Name any you use in your log\'s `skills:` frontmatter.')
  return out.join('\n')
}

// A repo opted in (its rule files carry the godkit block) but has no .agent/ — a fresh clone of a
// project that keeps .agent/ out of git — or a folder with no code at all, where a new project is
// starting. Either way the scaffold is ten seconds nobody should have to ask for.
function shouldScaffold(root) {
  for (const f of ['CLAUDE.md', 'AGENTS.md']) {
    try {
      if (fs.readFileSync(path.join(root, f), 'utf8').includes('<!-- godkit:start -->')) return true
    } catch {
      /* absent */
    }
  }
  try {
    if (path.resolve(root) === path.resolve(require('os').homedir())) return false
  } catch {
    /* no home: fall through */
  }
  return require('../lib/scan').codeCount(root, 1).count === 0
}

// Messages only: the file's own preamble explains the format, which nobody needs every session.
function threadTail(agentDir, file) {
  const { fitBytes } = require('../lib/paths')
  const text = clippedRead(agentDir, file, 64 * 1024, true) || ''
  const at = text.search(/^## \d{4}-\d{2}-\d{2}T/m)
  return at === -1 ? null : fitBytes(text.slice(at).trim(), LIMITS.thread, true)
}

function section(title, content) {
  return content ? '### ' + title + '\n' + content : ''
}

function main() {
  const { findAgentContext, fitBytes, logEntries, paths } = require('../lib/paths')
  const { readHookInput } = require('../lib/session')
  const payload = readHookInput('brief')
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  let context = findAgentContext(cwd)

  if (!context.agentDir && shouldScaffold(context.stateRoot)) {
    try {
      require('child_process').execFileSync(
        process.execPath,
        [path.join(ROOT, 'bin', 'godkit.js'), 'init', context.stateRoot, '--quiet', '--no-install', '--no-skills'],
        { stdio: 'ignore', timeout: 5000 },
      )
    } catch {
      /* fall through to the hint below */
    }
    context = findAgentContext(cwd)
  }

  if (!context.agentDir) {
    process.stdout.write(
      'No .agent/ here. If you will change code, run `' + CLI + ' init` first (no permission ' +
        'needed); until it exists, nothing you do is visible to the next agent.\n',
    )
    return
  }

  const p = paths(context.stateRoot)
  const board = clippedRead(context.agentDir, p.board, 64 * 1024, false)
  const logs = logEntries(context.agentDir).slice(0, LOGS_SHOWN).map((f) => logLine(context.agentDir, f))

  const parts = [
    '## Handoff (.agent/) — read before editing, log before finishing',
    // State first: "new project" or "map missing" decides what the agent does before anything else.
    section('MAP', fitBytes(mapState(context, p), LIMITS.map)),
    section('BOARD (live items only)', board && fitBytes(boardDigest(board), LIMITS.board)),
    section('Recent logs (newest first; open one only if its scope overlaps yours)', logs.length ? fitBytes(logs.join('\n'), LIMITS.logs) : '(none yet)'),
    section('THREAD (tail)', threadTail(context.agentDir, p.thread)),
    fitBytes(notes(context, p), LIMITS.notes),
  ].filter(Boolean)

  // The exact log name the Stop hook will look for, so the first log written is the right one.
  const sid = require('../lib/paths').sessionSlug(payload.session_id)
  const reminder = REMINDER + (sid ? '\nYour log this session: .agent/log/<UTC>-<your-model-id>-' + sid + '.md' : '')
  const bodyBudget = MAX_BRIEF - Buffer.byteLength(reminder, 'utf8') - 3
  const body = fitBytes(parts.join('\n\n'), bodyBudget)
  process.stdout.write(body + '\n\n' + reminder + '\n')
}

try {
  main()
} catch (error) {
  process.stderr.write('godkit brief: ' + (error && error.message) + '\n')
}
process.exit(0)
