'use strict'
// "Is godkit really running by itself in the CLI, the VS Code extension and the desktop app of each
// agent?" cannot be answered by reading config files: a hook can be registered and still be skipped
// (Codex skips a hook until it is approved) or fail (Antigravity on Windows mangled quotes). So every
// SessionStart hook leaves one line behind: which agent, which surface, when. `godkit doctor` shows it.
//
// Which agent: the transcript path every host hands a hook lives under that agent's own folder
// (~/.claude, ~/.codex, ~/.cursor, ~/.gemini). Which surface: only Claude Code says (its
// CLAUDE_CODE_ENTRYPOINT: cli, claude-vscode, claude-desktop); for the others there is one bucket.
//
// godkit: a ledger of last-seen times, not a log. Best effort, last writer wins, never throws.

const fs = require('fs')
const os = require('os')
const path = require('path')

const { atomicWriteFile, readRaw } = require('./session')

const HOSTS = ['claude', 'codex', 'cursor', 'antigravity']
const SURFACES = { cli: 'cli', 'claude-vscode': 'vscode', 'claude-desktop': 'desktop' }

function file(env) {
  const e = env || process.env
  return path.join(e.GODKIT_HOME || path.join(os.homedir(), '.godkit'), 'seen.json')
}

function hostFrom(transcriptPath) {
  const p = String(transcriptPath || '').replace(/\\/g, '/')
  if (p.includes('/.claude/')) return 'claude'
  if (p.includes('/.codex/')) return 'codex'
  if (p.includes('/.cursor/')) return 'cursor'
  if (p.includes('/.gemini/')) return 'antigravity'
  return null
}

function surfaceFrom(host, env) {
  if (host !== 'claude') return 'default'
  const raw = String((env || process.env).CLAUDE_CODE_ENTRYPOINT || '')
  return SURFACES[raw] || raw || 'default'
}

function read(env) {
  try {
    const value = JSON.parse(readRaw(file(env)) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

// payload: the hook input. host: pass it when the caller already knows (the adapter does).
function record(payload, host, env) {
  try {
    const who = host || (payload && payload.godkit_host) || hostFrom(payload && (payload.transcript_path || payload.transcriptPath))
    if (!who) return false
    const ledger = read(env)
    const surface = surfaceFrom(who, env)
    const prior = (ledger[who] && ledger[who][surface]) || {}
    ledger[who] = Object.assign({}, ledger[who], { [surface]: { at: new Date().toISOString(), count: (prior.count || 0) + 1 } })
    atomicWriteFile(file(env), JSON.stringify(ledger, null, 2) + '\n')
    return true
  } catch {
    return false
  }
}

function ago(iso, now) {
  const s = Math.max(0, Math.round(((now || Date.now()) - Date.parse(iso)) / 1000))
  if (s < 90) return s + 's ago'
  if (s < 5400) return Math.round(s / 60) + ' min ago'
  if (s < 129600) return Math.round(s / 3600) + ' h ago'
  return Math.round(s / 86400) + ' days ago'
}

// [{ host, seen: [{ surface, at, count }] }] in a fixed host order.
function summary(env) {
  const ledger = read(env)
  return HOSTS.map((host) => ({
    host,
    seen: Object.entries(ledger[host] || {})
      .map(([surface, v]) => ({ surface, at: v.at, count: v.count }))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
  }))
}

module.exports = { HOSTS, file, hostFrom, surfaceFrom, record, read, summary, ago }
