#!/usr/bin/env node
// Subagent handoff enforcement for Claude Code.
//   --session-start : inject .agent/BOARD.md + the newest 2 log entries as context
//   --stop          : block the turn until this session wrote its .agent/log entry
// Reads the hook payload as JSON on stdin. Never throws: a broken hook must not break a session.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const MAX_BRIEF = 8000 // chars of injected context; the board is one screen by design

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}

// Nearest .agent/ at or above start, so a hook fired from a subdirectory still finds it.
function findAgentDir(start) {
  let dir = path.resolve(start || process.cwd())
  for (;;) {
    const candidate = path.join(dir, '.agent')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function logEntries(agentDir) {
  const logDir = path.join(agentDir, 'log')
  if (!fs.existsSync(logDir)) return []
  return fs
    .readdirSync(logDir)
    .filter((f) => f.endsWith('.md'))
    .sort() // filenames are ISO-prefixed, so lexical sort is chronological
    .reverse()
    .map((f) => path.join(logDir, f))
}

function sessionStart(payload) {
  const agentDir = findAgentDir(payload.cwd)
  if (!agentDir) {
    process.stdout.write(
      'No .agent/ in this repo. Before your first edit, load the subagent-handoff skill and ' +
        'create .agent/BOARD.md + .agent/log/ — several agents share this repo.\n',
    )
    return
  }

  const parts = ['## Handoff (.agent/) — read before editing, log before finishing']

  const board = path.join(agentDir, 'BOARD.md')
  if (fs.existsSync(board)) parts.push('### BOARD.md\n' + fs.readFileSync(board, 'utf8').trim())

  for (const entry of logEntries(agentDir).slice(0, 2)) {
    parts.push('### log/' + path.basename(entry) + '\n' + fs.readFileSync(entry, 'utf8').trim())
  }

  parts.push(
    'Claim your scope on the board before you edit. If your files overlap an open claim, do not ' +
      'edit them. Write your own log entry before this session ends.',
  )

  let brief = parts.join('\n\n')
  if (brief.length > MAX_BRIEF) brief = brief.slice(0, MAX_BRIEF) + '\n…(truncated, read .agent/ directly)'
  process.stdout.write(brief + '\n')
}

// subagent: dirty-tree proxy for "this session did work" — a session that committed everything, or
// a repo without git, is not blocked. Tighten by diffing HEAD against session start if it matters.
function didWork(cwd) {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\n').some((line) => line.trim() && !line.includes('.agent/'))
  } catch {
    return false // no git, or not a repo: nothing to prove, do not block
  }
}

function stop(payload) {
  if (payload.stop_hook_active) return // already blocked once this turn; never loop

  const cwd = payload.cwd || process.cwd()
  const agentDir = findAgentDir(cwd)
  if (!agentDir) return
  if (!didWork(path.dirname(agentDir))) return

  const sid = String(payload.session_id || '').slice(0, 8)
  if (sid && logEntries(agentDir).some((f) => path.basename(f).includes(sid))) return

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const name = stamp.slice(0, 4) + '-' + stamp.slice(4, 6) + '-' + stamp.slice(6, 13) + 'Z-claude-' + sid
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        'Clock out first: this session changed files but wrote no handoff log. ' +
        'Write .agent/log/' + name + '.md (agent, session, scope, status, Did, Verified, Bugs, ' +
        'Decisions, Left/next), then update .agent/BOARD.md — release your claim, update bugs and ' +
        'the handoff list. See the subagent-handoff skill. Then stop.',
    }) + '\n',
  )
}

const payload = readStdin()
try {
  if (process.argv.includes('--stop')) stop(payload)
  else sessionStart(payload)
} catch (err) {
  process.stderr.write('agent-brief: ' + (err && err.message) + '\n')
}
process.exit(0)
