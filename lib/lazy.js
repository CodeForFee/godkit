'use strict'
// Shared support for the godkit-lazy mode system. Persisted defaults are user configuration;
// active modes are isolated by host session under lib/session's Godkit-owned state directory.

const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  atomicWriteFile,
  readRaw,
  readState,
  removeState,
  statePath: sessionStatePath,
  warning,
  writeState,
} = require('./session')

const DEFAULT_MODE = 'full'
const MODES = ['off', 'lite', 'full', 'ultra']
const SKILL_PATH = path.join(__dirname, '..', 'skills', 'godkit-lazy', 'SKILL.md')

function normalizeMode(mode) {
  if (typeof mode !== 'string') return null
  const value = mode.trim().toLowerCase()
  return MODES.includes(value) ? value : null
}

function isDeactivationCommand(text) {
  const value = String(text || '').trim().toLowerCase().replace(/[.!?\s]+$/, '')
  return value === 'stop godkit-lazy' || value === 'normal mode'
}

function configDir() {
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'godkit')
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'godkit')
  }
  return path.join(os.homedir(), '.config', 'godkit')
}

function configPath() {
  return path.join(configDir(), 'config.json')
}

function readConfigRecord(file) {
  const raw = readRaw(file)
  if (raw === null) return { raw: null, value: {} }
  let value
  try {
    const json = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
    value = JSON.parse(json)
  } catch {
    throw new Error('config is not valid JSON; left byte-identical at ' + file)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('config must contain a JSON object; left byte-identical at ' + file)
  }
  return { raw, value }
}

function getDefaultMode() {
  const fromEnv = normalizeMode(process.env.GODKIT_LAZY_MODE)
  if (fromEnv) return fromEnv
  try {
    const config = readConfigRecord(configPath()).value
    return normalizeMode(config.defaultMode) || DEFAULT_MODE
  } catch (error) {
    warning('lazy config', error)
    return DEFAULT_MODE
  }
}

// Refuses malformed input rather than converting it into an empty object. The same-directory
// temp + fsync + rename keeps readers from observing a partial write, and the previous valid bytes
// remain in config.json.bak.
function writeDefaultMode(mode) {
  const normalized = normalizeMode(mode)
  if (!normalized) return null
  const file = configPath()
  const record = readConfigRecord(file)
  const next = Object.assign({}, record.value, { defaultMode: normalized })
  atomicWriteFile(file, JSON.stringify(next, null, 2) + '\n', {
    expectedRaw: record.raw,
    backup: true,
  })
  return normalized
}

function isCodex() {
  return Boolean(process.env.PLUGIN_DATA)
}

function statePath(input) {
  return sessionStatePath('lazy', input, 'mode.json')
}

function setMode(input, mode) {
  const normalized = normalizeMode(mode)
  if (!normalized || normalized === 'off') throw new Error('cannot activate invalid lazy mode')
  writeState('lazy', input, { mode: normalized, updatedAt: new Date().toISOString() }, 'mode.json')
  return normalized
}

function clearMode(input) {
  removeState('lazy', input, 'mode.json')
}

function readMode(input) {
  const state = readState('lazy', input, 'mode.json')
  return state && normalizeMode(state.mode)
}

// Claude accepts raw stdout for SessionStart; the event envelope works for prompt/subagent hooks.
// Codex receives the same context plus a compact badge when plugin state identifies that host.
function writeHookOutput(event, mode, context) {
  if (isCodex()) {
    const out = { systemMessage: 'GODKIT-LAZY:' + String(mode).toUpperCase() }
    if (context) out.hookSpecificOutput = { hookEventName: event, additionalContext: context }
    process.stdout.write(JSON.stringify(out))
    return
  }
  if (event === 'SessionStart') {
    process.stdout.write(context || '')
    return
  }
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }),
  )
}

function filterSkillBodyForMode(body, mode) {
  return String(body || '')
    .split(/\r?\n/)
    .filter((line) => {
      const row = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/)
      if (!row) return true
      const rowMode = normalizeMode(row[1].trim())
      return rowMode ? rowMode === mode : true
    })
    .join('\n')
}

function getLazyInstructions(mode) {
  const effective = normalizeMode(mode) || DEFAULT_MODE
  let body
  try {
    body = fs.readFileSync(SKILL_PATH, 'utf8').replace(/^---[\s\S]*?---\s*/, '')
  } catch {
    body =
      '# Lazy\n\nQuestion whether the code needs to exist, reuse what the repo already has, ' +
      'reach for the standard library and native platform features before a dependency, one ' +
      'line before fifty. Never simplify away validation, error handling, security or ' +
      'accessibility.\n'
  }
  return 'GODKIT-LAZY MODE ACTIVE — level: ' + effective + '\n\n' + filterSkillBodyForMode(body, effective)
}

module.exports = {
  DEFAULT_MODE,
  MODES,
  normalizeMode,
  isDeactivationCommand,
  configPath,
  readConfigRecord,
  getDefaultMode,
  writeDefaultMode,
  isCodex,
  statePath,
  setMode,
  clearMode,
  readMode,
  writeHookOutput,
  getLazyInstructions,
}
