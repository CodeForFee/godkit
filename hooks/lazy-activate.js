#!/usr/bin/env node
'use strict'
// SessionStart: resolve the active godkit-lazy mode and inject its ruleset as context, the same
// way brief.js injects the board — but for the write-less-code discipline, not the handoff state.
//
// A hook that throws breaks the session it was meant to help, so this one never throws and
// always exits 0.

const { getDefaultMode, getLazyInstructions, clearMode, setMode, writeHookOutput } = require('../lib/lazy')
const { readHookInput, sessionId, warning } = require('../lib/session')

function main() {
  const payload = readHookInput('lazy-activate')
  const mode = getDefaultMode()

  // "off" — skip activation entirely, don't write a flag or emit anything.
  if (mode === 'off') {
    if (sessionId(payload)) clearMode(payload)
    return
  }

  try {
    setMode(payload, mode)
  } catch (error) {
    warning('lazy-activate', error)
  }

  writeHookOutput('SessionStart', mode, getLazyInstructions(mode))
}

try {
  main()
} catch (err) {
  process.stderr.write('godkit lazy-activate: ' + (err && err.message) + '\n')
}
process.exit(0)
