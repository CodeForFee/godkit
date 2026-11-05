#!/usr/bin/env node
'use strict'
// PreToolUse (edit tools): take a file checkpoint of the working tree BEFORE the agent changes
// anything, so `godkit rewind` has somewhere to go back to. Debounced to one per 15 seconds per
// session (GODKIT_CHECKPOINT_DEBOUNCE, in seconds), because every edit would otherwise hash the
// tree. Says nothing and never blocks; GODKIT_CHECKPOINT=off turns it off.

const { findAgentContext } = require('../lib/paths')
const { snapshot } = require('../lib/checkpoint')
const { readHookInput, readState, sessionId, warning, writeState } = require('../lib/session')

const STATE = 'checkpoint.json'

function main() {
  if (/^(off|0|false)$/i.test(process.env.GODKIT_CHECKPOINT || '')) return
  const payload = readHookInput('checkpoint')
  const sid = sessionId(payload)
  if (!sid) return
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  const context = findAgentContext(cwd)
  if (!context.agentDir) return // a project that never opted in to godkit is not ours to snapshot

  const debounce = (process.env.GODKIT_CHECKPOINT_DEBOUNCE === undefined ? 15 : Number(process.env.GODKIT_CHECKPOINT_DEBOUNCE) || 0) * 1000
  let state = null
  try {
    state = readState('work', payload, STATE)
  } catch {
    /* start over */
  }
  if (state && Date.now() - state.at < debounce) return

  snapshot(context.worktreeRoot, sid)
  writeState('work', payload, { at: Date.now() }, STATE)
}

try {
  main()
} catch (error) {
  warning('checkpoint', error)
}
process.exit(0)
