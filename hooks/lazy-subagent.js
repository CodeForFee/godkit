#!/usr/bin/env node
'use strict'
// SubagentStart: inherit the parent session's lazy rules. When an optional matcher is configured,
// malformed matcher/input fails closed for injection and warns instead of broadening its scope.

const { readMode, getLazyInstructions, writeHookOutput } = require('../lib/lazy')
const { readHookInput, warning } = require('../lib/session')

function main() {
  const payload = readHookInput('lazy-subagent')
  const mode = readMode(payload)
  if (!mode) return

  const source = process.env.GODKIT_LAZY_SUBAGENT_MATCHER
  if (source) {
    let matcher
    try {
      matcher = new RegExp(source, 'i')
    } catch (error) {
      warning('lazy-subagent', new Error('invalid GODKIT_LAZY_SUBAGENT_MATCHER; injection skipped (' + error.message + ')'))
      return
    }
    const agentType = typeof payload.agent_type === 'string' ? payload.agent_type.trim() : ''
    if (!agentType) {
      warning('lazy-subagent', new Error('matcher configured but agent_type is missing; injection skipped'))
      return
    }
    if (!matcher.test(agentType)) return
  }

  writeHookOutput('SubagentStart', mode, getLazyInstructions(mode))
}

try {
  main()
} catch (error) {
  warning('lazy-subagent', error)
}
process.exit(0)
