#!/usr/bin/env node
'use strict'
// UserPromptSubmit: switch only the submitting session's lazy mode. Slash, dollar, and at-sign
// command forms cover Claude/Codex adapters without making ordinary mentions actionable.

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
const { readHookInput, warning } = require('../lib/session')

const USAGE = 'Usage: /godkit-lazy [lite|full|ultra|off] or /godkit-lazy default <mode>.'

function currentMode(payload) {
  try {
    return readMode(payload) || getDefaultMode()
  } catch (error) {
    warning('lazy-mode-tracker', error)
    return getDefaultMode()
  }
}

function main() {
  const payload = readHookInput('lazy-mode-tracker')
  const prompt = String(payload.prompt || '').trim().toLowerCase()

  if (/^[\/@$]godkit-lazy(?:\s|$)/.test(prompt)) {
    const parts = prompt.split(/\s+/)
    const arg = parts[1] || ''

    if (arg === 'default') {
      const written = writeDefaultMode(parts[2])
      if (!written) {
        writeHookOutput('UserPromptSubmit', currentMode(payload), USAGE)
        return
      }
      writeHookOutput(
        'UserPromptSubmit',
        written,
        'GODKIT-LAZY DEFAULT SET — new sessions start in ' + written + '.',
      )
      return
    }

    if (!arg) {
      const current = currentMode(payload)
      writeHookOutput('UserPromptSubmit', current, 'GODKIT-LAZY MODE ACTIVE — level: ' + current)
      return
    }

    const mode = normalizeMode(arg)
    if (!mode) {
      writeHookOutput('UserPromptSubmit', currentMode(payload), USAGE)
      return
    }
    if (mode === 'off') {
      clearMode(payload)
      writeHookOutput('UserPromptSubmit', 'off', 'GODKIT-LAZY MODE OFF')
      return
    }

    setMode(payload, mode)
    writeHookOutput('UserPromptSubmit', mode, 'GODKIT-LAZY MODE CHANGED — level: ' + mode)
    return
  }

  if (isDeactivationCommand(prompt)) {
    clearMode(payload)
    writeHookOutput('UserPromptSubmit', 'off', 'GODKIT-LAZY MODE OFF')
  }
}

try {
  main()
} catch (error) {
  warning('lazy-mode-tracker', error)
}
process.exit(0)
