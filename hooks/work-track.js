#!/usr/bin/env node
'use strict'
// Registration-ready lifecycle hook. T-005 may invoke it with pre/post/edit/end, or without an
// argument on hosts that supply hook_event_name. It never blocks; failures warn and fail open.

const { findAgentContext } = require('../lib/paths')
const { clearSession, readHookInput, warning } = require('../lib/session')
const { captureBefore, finishAfter, recordDirectEdit } = require('../lib/work')

function mode(payload) {
  const explicit = String(process.argv[2] || '').toLowerCase()
  if (['pre', 'post', 'edit', 'end'].includes(explicit)) return explicit
  const event = String(payload.hook_event_name || '').toLowerCase()
  if (event === 'pretooluse') return 'pre'
  if (event === 'sessionend') return 'end'
  if (event === 'posttooluse' || event === 'posttoolusefailure') {
    const tool = String(payload.tool_name || '').toLowerCase()
    return ['edit', 'write', 'apply_patch', 'notebookedit'].includes(tool) ? 'edit' : 'post'
  }
  return null
}

function main() {
  const payload = readHookInput('work-track')
  const action = mode(payload)
  if (!action) return
  if (action === 'end') {
    clearSession(payload)
    return
  }

  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  const context = findAgentContext(cwd)
  if (!context.agentDir) return
  if (action === 'pre') captureBefore(payload, context.worktreeRoot)
  else if (action === 'post') finishAfter(payload, context.worktreeRoot)
  else recordDirectEdit(payload, context)
}

try {
  main()
} catch (error) {
  warning('work-track', error)
}
process.exit(0)
