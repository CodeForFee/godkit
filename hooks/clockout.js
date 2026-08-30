#!/usr/bin/env node
'use strict'
// Stop: a session with recorded project work keeps blocking until its own handoff log exists.
// Unrelated dirty files and unrelated sessions are never evidence for or against this session.

const path = require('path')

const { findAgentContext, logEntries, logName, readContained, sessionSlug } = require('../lib/paths')
const { readHookInput, sessionId, warning } = require('../lib/session')
const { checkLog, parseFrontmatter } = require('../lib/contract')
const { clearWork, didSessionWork } = require('../lib/work')

function frontmatterSession(agentDir, file) {
  const result = readContained(agentDir, file, 4096, false)
  if (!result) return null
  return parseFrontmatter(result.text).session || null
}

// The path, not a boolean: the log has to be read again to see whether it proves anything.
function sessionLog(agentDir, sid) {
  const short = sessionSlug(sid)
  for (const file of logEntries(agentDir)) {
    const base = path.basename(file)
    if (short && base.endsWith('-' + short + '.md')) return file
    const logged = frontmatterSession(agentDir, file)
    if (logged === sid || (short && logged === short)) return file
  }
  return null
}

function main() {
  const payload = readHookInput('clockout')
  if (payload.stop_hook_active) return // already blocked once this turn; blocking again loops forever
  const sid = sessionId(payload)
  if (!sid) throw new Error('missing session_id; clockout enforcement skipped')
  if (!didSessionWork(payload)) return

  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  const context = findAgentContext(cwd)
  if (!context.agentDir) return

  const written = sessionLog(context.agentDir, sid)
  if (written) {
    // One check, not the whole contract: a log claiming `done` with nothing under ## Verified.
    // Everything else `godkit verify` reports stays advisory — a Stop hook must not become a wall.
    const unproven = checkLog(context.agentDir, written).find((f) => f.tag === 'no-verify')
    if (!unproven) {
      clearWork(payload)
      return
    }
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason:
          'Your handoff log claims status: done but ## Verified is empty. Put the command you ' +
          'actually ran and its real output in .agent/log/' + path.basename(written) + ', or set ' +
          'status: partial and say what is left under Left / next. A passing return value is not ' +
          'evidence — see godkit-test. `godkit verify` shows every task and log this covers.',
      }) + '\n',
    )
    return
  }

  const agent = process.env.PLUGIN_DATA ? 'codex' : 'claude'
  const name = logName(agent, sid)
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        'Clock out first: this session changed project files but has no exact-session handoff log. ' +
        'Write .agent/log/' + name + ' (agent, session, scope, status, then Did / Verified / Bugs / ' +
        'Decisions / Left-next), then update .agent/BOARD.md and THREAD if another agent is ' +
        'waiting. This check repeats until that log exists; see godkit-handoff.',
    }) + '\n',
  )
}

try {
  main()
} catch (error) {
  warning('clockout', error)
}
process.exit(0)
