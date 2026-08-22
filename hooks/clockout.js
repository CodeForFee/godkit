#!/usr/bin/env node
'use strict'
// Stop: refuse to end a session that changed files but left no log entry.
//
// This is the only hook that blocks, because an unlogged session is the failure the whole
// protocol exists to prevent — the next agent cannot tell it from work that never happened.
// It blocks at most once per turn and never for a read-only session.

const fs = require('fs')
const path = require('path')

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}

// godkit: a dirty git tree is a proxy for "this session did work". A session that committed
// everything, or a repo with no git, is not blocked. Tighten by diffing HEAD against the sha at
// session start if the proxy ever misfires.
function didWork(root) {
  const { git } = require('../lib/paths')
  const out = git(['status', '--porcelain'], root)
  if (!out) return false // clean tree, no git, or not a repo: nothing to prove
  return out.split('\n').some((line) => line.trim() && !line.includes('.agent/'))
}

function main() {
  const { findAgentDir, logEntries, logName } = require('../lib/paths')
  const payload = readStdin()

  if (payload.stop_hook_active) return // already blocked once this turn; never loop

  const cwd = payload.cwd || process.cwd()
  const agentDir = findAgentDir(cwd)
  if (!agentDir) return // no protocol here to enforce

  if (!didWork(path.dirname(agentDir))) return

  const sid = String(payload.session_id || '').slice(0, 8)
  if (sid && logEntries(agentDir).some((f) => path.basename(f).includes(sid))) return // already logged

  const name = logName('claude', sid)
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        'Clock out first: this session changed files but wrote no handoff log. Write ' +
        '.agent/log/' + name + ' (agent, session, scope, status, then Did / Verified / Bugs / ' +
        'Decisions / Left-next), then update .agent/BOARD.md — release your claim, update the ' +
        'bug list and the handoff list. If another agent is waiting on you, add a block to ' +
        '.agent/THREAD.md. See the godkit-handoff skill. Then stop.',
    }) + '\n',
  )
}

try {
  main()
} catch (err) {
  process.stderr.write('godkit clockout: ' + (err && err.message) + '\n')
}
process.exit(0)
