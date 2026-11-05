'use strict'
// Registering `godkit mcp` with the hosts, and the git pre-commit hook. Same rules as the hook
// installer: touch only what is ours, keep a .bak, write atomically, and never create a host's
// folder for someone who does not use that host.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const { git } = require('./paths')
const { atomicWriteFile, readRaw } = require('./session')

const NAME = 'godkit'
const MARK = '# godkit:pre-commit'
const fwd = (p) => p.replace(/\\/g, '/')

// [tool, file, format]. A host is included when its folder exists or its variable points somewhere.
function mcpTargets(env) {
  const e = env || process.env
  const home = os.homedir()
  const out = []
  const cursor = e.CURSOR_HOME || path.join(home, '.cursor')
  if (e.CURSOR_HOME || fs.existsSync(cursor)) out.push(['cursor', path.join(cursor, 'mcp.json'), 'json'])
  const gemini = e.GEMINI_HOME || path.join(home, '.gemini')
  if (e.GEMINI_HOME || fs.existsSync(path.join(gemini, 'antigravity'))) out.push(['antigravity', path.join(gemini, 'config', 'mcp_config.json'), 'json'])
  const codex = e.CODEX_HOME || path.join(home, '.codex')
  if (e.CODEX_HOME || fs.existsSync(codex)) out.push(['codex', path.join(codex, 'config.toml'), 'toml'])
  return out
}

const isOurs = (args) => Array.isArray(args) && args.some((a) => typeof a === 'string' && fwd(a).endsWith('bin/godkit.js'))

// JSON hosts: { "mcpServers": { "godkit": { "command", "args" } } }. Returns the new text, or null for "no change".
function applyJson(raw, uninstall, bin) {
  let doc = {}
  if (raw && raw.trim()) {
    doc = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw)
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('not a JSON object')
  }
  const servers = doc.mcpServers && typeof doc.mcpServers === 'object' ? { ...doc.mcpServers } : {}
  const prior = servers[NAME]
  if (prior && !isOurs(prior.args)) throw new Error('an MCP server named "' + NAME + '" already exists and is not ours')
  if (uninstall) {
    if (!prior) return null
    delete servers[NAME]
  } else {
    servers[NAME] = { command: 'node', args: [fwd(bin), 'mcp'] }
  }
  const next = JSON.stringify({ ...doc, mcpServers: servers }, null, 2) + '\n'
  return next === raw ? null : next
}

// Codex: a [mcp_servers.godkit] table in config.toml, edited as text so nothing else is reformatted.
function applyToml(raw, uninstall, bin) {
  const lines = String(raw || '').split('\n')
  const head = '[mcp_servers.' + NAME + ']'
  const at = lines.findIndex((l) => l.trim() === head)
  if (at >= 0) {
    let end = at + 1
    while (end < lines.length && !lines[end].trim().startsWith('[')) end++
    if (!lines.slice(at, end).some((l) => fwd(l).includes('bin/godkit.js'))) throw new Error('a [' + head.slice(1) + ' table already exists and is not ours')
    lines.splice(at, end - at)
  } else if (uninstall) return null
  let text = lines.join('\n')
  if (!uninstall) {
    text = text.replace(/\n*$/, '\n') + '\n' + head + '\ncommand = "node"\nargs = ["' + fwd(bin) + '", "mcp"]\n'
  }
  return text === raw ? null : text
}

function registerFiles(action, dryRun, bin, env) {
  const results = []
  for (const [tool, file, format] of mcpTargets(env)) {
    try {
      const raw = readRaw(file)
      if (action === 'uninstall' && raw === null) continue
      const next = (format === 'json' ? applyJson : applyToml)(raw, action === 'uninstall', bin)
      if (next !== null && !dryRun) atomicWriteFile(file, next, { expectedRaw: raw, backup: true })
      results.push({ tool, file, changed: next !== null })
    } catch (error) {
      results.push({ tool, file, error: error.message })
    }
  }
  return results
}

// Claude Code keeps user-scope servers in ~/.claude.json, which it owns; its own CLI is the way in.
function registerClaude(action, dryRun, bin) {
  const run = (args) => spawnSync('claude', args, { encoding: 'utf8', timeout: 20000, windowsHide: true })
  if (run(['--version']).status !== 0) return { tool: 'claude', error: 'the claude CLI is not on PATH; run: claude mcp add --scope user godkit -- node "' + fwd(bin) + '" mcp' }
  const exists = run(['mcp', 'get', NAME]).status === 0
  if (action === 'uninstall' && !exists) return null
  if (dryRun) return { tool: 'claude', file: 'claude mcp (user scope)', changed: true }
  if (exists) run(['mcp', 'remove', NAME, '--scope', 'user'])
  if (action === 'uninstall') return { tool: 'claude', file: 'claude mcp (user scope)', changed: true }
  const add = run(['mcp', 'add', '--scope', 'user', NAME, '--', 'node', fwd(bin), 'mcp'])
  return add.status === 0 ? { tool: 'claude', file: 'claude mcp (user scope)', changed: true } : { tool: 'claude', error: (add.stderr || 'claude mcp add failed').trim() }
}

// True when every host file already says what registerMcp would write. The claude CLI part is not
// asked about: it is registered together with the files the first time, and `godkit mcp install` redoes it.
function mcpReady(bin, env) {
  return mcpTargets(env).every(([, file, format]) => {
    try {
      return (format === 'json' ? applyJson : applyToml)(readRaw(file), false, bin) === null
    } catch {
      return true // a file we cannot read is not ours to rewrite from init
    }
  })
}

function registerMcp(action, dryRun, bin, env) {
  const results = registerFiles(action, dryRun, bin, env)
  const e = env || process.env
  if (!e.GODKIT_NO_CLAUDE_CLI) {
    const claude = registerClaude(action, dryRun, bin)
    if (claude) results.push(claude)
  }
  return results
}

// --- git pre-commit ----------------------------------------------------------------------------

function hookFile(root) {
  const rel = git(['rev-parse', '--git-path', 'hooks/pre-commit'], root)
  return rel ? path.resolve(root, rel) : null
}

function hookBody(bin) {
  // Fail open: if godkit or node is gone (an npx cache was pruned, a machine changed), the commit goes through.
  return (
    '#!/bin/sh\n' + MARK + '\n' +
    '# Warns about staged files outside every live claim. GODKIT_STRICT=1 (or `git config godkit.strict true`) makes it block.\n' +
    'BIN="' + fwd(bin) + '"\n' +
    '[ -f "$BIN" ] || exit 0\n' +
    'command -v node >/dev/null 2>&1 || exit 0\n' +
    'exec node "$BIN" check-staged\n'
  )
}

function githook(action, root, bin, dryRun) {
  const file = hookFile(root)
  if (!file) return { ok: false, reason: 'not a git repository' }
  const raw = readRaw(file)
  const ours = raw !== null && raw.includes(MARK)
  if (action === 'status') return { ok: true, file, installed: ours, foreign: raw !== null && !ours }
  if (raw !== null && !ours) return { ok: false, file, reason: 'a pre-commit hook that is not ours is already there; add `node "' + fwd(bin) + '" check-staged` to it yourself' }
  if (action === 'uninstall') {
    if (ours && !dryRun) fs.rmSync(file)
    return { ok: true, file, changed: ours }
  }
  if (raw === hookBody(bin)) return { ok: true, file, changed: false }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, hookBody(bin), { mode: 0o755 })
  }
  return { ok: true, file, changed: true }
}

module.exports = { mcpReady, mcpTargets, applyJson, applyToml, registerMcp, githook, hookBody, MARK }
