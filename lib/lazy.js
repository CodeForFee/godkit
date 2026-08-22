'use strict'
// Shared support for the godkit-lazy mode system: resolving the active intensity level, tracking
// it across a session via a state flag, and building the instructions a hook injects.
//
// Mode resolution order: GODKIT_LAZY_MODE env var -> config file defaultMode -> 'full'.
// Config file: $XDG_CONFIG_HOME/godkit/config.json, or ~/.config/godkit/config.json (POSIX), or
// %APPDATA%\godkit\config.json (Windows). Same shape as sanitizePath's platform split in
// lib/graph.js — path.isAbsolute() and separator conventions differ by OS, so build the path with
// path.join, never string concatenation.

const fs = require('fs')
const os = require('os')
const path = require('path')

const DEFAULT_MODE = 'full'
const MODES = ['off', 'lite', 'full', 'ultra']
const STATE_FILE = '.godkit-lazy-active'
const SKILL_PATH = path.join(__dirname, '..', 'skills', 'godkit-lazy', 'SKILL.md')

function normalizeMode(mode) {
  if (typeof mode !== 'string') return null
  const m = mode.trim().toLowerCase()
  return MODES.includes(m) ? m : null
}

// "stop godkit-lazy" / "normal mode" turn it off, but only as the whole message — matching the
// phrase anywhere would turn it off mid-task for an ordinary request like "add a normal mode".
function isDeactivationCommand(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?\s]+$/, '')
  return t === 'stop godkit-lazy' || t === 'normal mode'
}

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw)
  } catch {
    return null
  }
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

function getDefaultMode() {
  const env = normalizeMode(process.env.GODKIT_LAZY_MODE)
  if (env) return env
  const config = readJson(configPath())
  const fromConfig = config && normalizeMode(config.defaultMode)
  if (fromConfig) return fromConfig
  return DEFAULT_MODE
}

// `/godkit-lazy default <mode>` persists across sessions; a plain `/godkit-lazy <mode>` only
// changes the state flag below, which lasts for this session.
function writeDefaultMode(mode) {
  const normalized = normalizeMode(mode)
  if (!normalized) return null
  const file = configPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const config = readJson(file) || {}
  config.defaultMode = normalized
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n')
  return normalized
}

// Codex sets PLUGIN_DATA for its plugin state dir; its absence means the native Claude host.
function isCodex() {
  return Boolean(process.env.PLUGIN_DATA)
}

function stateDir() {
  if (isCodex()) return process.env.PLUGIN_DATA
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function statePath() {
  return path.join(stateDir(), STATE_FILE)
}

function setMode(mode) {
  const file = statePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, mode)
}

function clearMode() {
  try {
    fs.unlinkSync(statePath())
  } catch {
    /* absent flag already means off */
  }
}

// Live mode written by activate/mode-tracker for this session. No flag = not active.
function readMode() {
  try {
    return normalizeMode(fs.readFileSync(statePath(), 'utf8').trim())
  } catch {
    return null
  }
}

// Claude Code accepts raw stdout for SessionStart, but needs the hookSpecificOutput envelope for
// SubagentStart and UserPromptSubmit. Codex always wants the envelope, plus a systemMessage badge.
function writeHookOutput(event, mode, context) {
  if (isCodex()) {
    const out = { systemMessage: 'GODKIT-LAZY:' + String(mode).toUpperCase() }
    if (context) out.hookSpecificOutput = { hookEventName: event, additionalContext: context }
    process.stdout.write(JSON.stringify(out))
    return
  }
  if (event === 'SessionStart') {
    process.stdout.write(context)
    return
  }
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }),
  )
}

// Only the Intensity table's rows are mode-specific; every other line ships to every mode as-is.
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
