#!/usr/bin/env node
'use strict'
// SubagentStart: SessionStart context never reaches a spawned subagent, so without this a
// delegated worker runs godkit-lazy-unaware. When a mode is active this session, inject the same
// ruleset into each subagent too.
//
// Opt-in scoping: set GODKIT_LAZY_SUBAGENT_MATCHER to a regex and the ruleset is injected only
// into subagents whose agent_type matches (unanchored, case-insensitive). Unset means inject into
// every subagent, which is the default.

const fs = require('fs')
const { readMode, getLazyInstructions, writeHookOutput } = require('../lib/lazy')

const mode = readMode()

function inject() {
  try {
    writeHookOutput('SubagentStart', mode, getLazyInstructions(mode))
  } catch {
    /* a stdout error at hook exit must not surface as a hook failure */
  }
}

function main() {
  if (!mode) return // no active mode this session, nothing to inject

  let matcher = null
  try {
    if (process.env.GODKIT_LAZY_SUBAGENT_MATCHER) {
      matcher = new RegExp(process.env.GODKIT_LAZY_SUBAGENT_MATCHER, 'i')
    }
  } catch {
    matcher = null // a bad regex must never block the hook — treat it as no matcher
  }

  if (!matcher) {
    inject()
    return
  }

  let input = ''
  try {
    input = fs.readFileSync(0, 'utf8')
  } catch {
    inject() // stdin unreadable — fail open rather than silently dropping the ruleset
    return
  }

  let agentType = ''
  try {
    agentType = String(JSON.parse(input).agent_type || '').trim()
  } catch {
    /* unparseable payload — fall through and inject to be safe */
  }

  if (agentType && !matcher.test(agentType)) return
  inject()
}

try {
  main()
} catch (err) {
  process.stderr.write('godkit lazy-subagent: ' + (err && err.message) + '\n')
}
process.exit(0)
