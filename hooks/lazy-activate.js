#!/usr/bin/env node
'use strict'
// SessionStart: resolve the active godkit-lazy mode and inject its ruleset as context, the same
// way brief.js injects the board — but for the write-less-code discipline, not the handoff state.
//
// A hook that throws breaks the session it was meant to help, so this one never throws and
// always exits 0.

const { getDefaultMode, getLazyInstructions, clearMode, setMode, writeHookOutput } = require('../lib/lazy')

function main() {
  const mode = getDefaultMode()

  // "off" — skip activation entirely, don't write a flag or emit anything.
  if (mode === 'off') {
    clearMode()
    return
  }

  try {
    setMode(mode)
  } catch {
    /* the flag is best-effort; a failed write must not block the ruleset from loading */
  }

  writeHookOutput('SessionStart', mode, getLazyInstructions(mode))
}

try {
  main()
} catch (err) {
  process.stderr.write('godkit lazy-activate: ' + (err && err.message) + '\n')
}
process.exit(0)
