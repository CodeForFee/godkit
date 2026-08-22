#!/usr/bin/env node
'use strict'
// Stop: a session with recorded project work keeps blocking until its own handoff log exists.
// Unrelated dirty files and unrelated sessions are never evidence for or against this session.

const path = require('path')

const { findAgentContext, logEntries, logName, readContained, sessionSlug } = require('../lib/paths')
const { readHookInput, sessionId, warning } = require('../lib/session')
const { clearWork, didSessionWork } = require('../lib/work')

function frontmatterSession(agentDir, file) {
  const result = readContained(agentDir, file, 4096, false)
  if (!result) return null
  const block = result.text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!block) return null
  const line = block[1].match(/^session:\s*(.+?)\s*$/mi)
  return line ? line[1].replace(/^['"]|['"]$/g, '').trim() : null
}

function hasSessionLog(agentDir, sid) {
  const short = sessionSlug(sid)
  for (const file of logEntries(agentDir)) {
    const base = path.basename(file)
    if (short && base.endsWith('-' + short + '.md')) return true
    const logged = frontmatterSession(agentDir, file)
    if (logged === sid || (short && logged === short)) return true
  }
  return false
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

  if (hasSessionLog(context.agentDir, sid)) {
    clearWork(payload)
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
