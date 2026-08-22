#!/usr/bin/env node
'use strict'
// UserPromptSubmit: parse the user's message for a `/godkit-lazy [lite|full|ultra|off]` switch,
// `/godkit-lazy default <mode>` (persists across sessions), or the plain "stop godkit-lazy" /
// "normal mode" deactivation phrase, and update the session's active mode.
//
// This is what lets the mode change mid-session without a new SessionStart.

const fs = require('fs')
const {
  getDefaultMode,
  isDeactivationCommand,
  normalizeMode,
  readMode,
  writeDefaultMode,
  clearMode,
  setMode,
  writeHookOutput,
} = require('../lib/lazy')

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}

function main() {
  const payload = readStdin()
  const prompt = String(payload.prompt || '').trim().toLowerCase()

  if (/^\/godkit-lazy\b/.test(prompt)) {
    const parts = prompt.split(/\s+/)
    const arg = parts[1] || ''

    if (arg === 'default') {
      const written = writeDefaultMode(parts[2])
      if (written) {
        writeHookOutput(
          'UserPromptSubmit',
          written,
          'GODKIT-LAZY DEFAULT SET — new sessions start in ' + written + '.',
        )
      }
      return
    }

    if (arg === '') {
      // Prefer this session's live mode (set by an earlier switch) over the configured default.
      const current = readMode() || getDefaultMode()
      writeHookOutput('UserPromptSubmit', current, 'GODKIT-LAZY MODE ACTIVE — level: ' + current)
      return
    }

    const mode = normalizeMode(arg)
    if (mode === 'off') {
      clearMode()
      writeHookOutput('UserPromptSubmit', 'off', 'GODKIT-LAZY MODE OFF')
      return
    }
    if (mode) {
      setMode(mode)
      writeHookOutput('UserPromptSubmit', mode, 'GODKIT-LAZY MODE CHANGED — level: ' + mode)
      return
    }
  }

  if (isDeactivationCommand(prompt)) {
    clearMode()
    writeHookOutput('UserPromptSubmit', 'off', 'GODKIT-LAZY MODE OFF')
  }
}

try {
  main()
} catch (err) {
  process.stderr.write('godkit lazy-mode-tracker: ' + (err && err.message) + '\n')
}
process.exit(0)
