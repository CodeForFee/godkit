'use strict'
// Registering `godkit mcp` with the hosts, and the git pre-commit hook. Same rules as the hook
// installer: touch only what is ours, keep a .bak, write atomically, and never create a host's
// folder for someone who does not use that host.

const fs = require('fs')
const os = require('os')
const path = require('path')

const { git } = require('./paths')
const { atomicWriteFile, readRaw } = require('./session')
const { nodePath, shellQuote } = require('./runtime')

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
/** @param {string|null} raw @param {boolean} uninstall @param {string} bin @returns {string|null} */
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
    servers[NAME] = { command: nodePath(), args: [fwd(bin), 'mcp'] }
  }
  const next = JSON.stringify({ ...doc, mcpServers: servers }, null, 2) + '\n'
  return next === raw ? null : next
}

// Codex asks before every MCP tool call and, run without a person (codex exec), refuses it. "approve"
// for this server alone lets godkit's own tools run; the one tool that can start a write-capable
// agent with a caller-chosen flag (godkit_delegate) keeps asking. tool_timeout_sec is long because a
// subagent run takes a minute or more and Codex's default would cut it off.
//
// That approval is a change to Codex's own safety setting, so it is OFF unless the user turns it on
// (`godkit mcp install --codex-approve`, remembered in godkit's config). The default block only adds
// the server and the long timeout; Codex keeps asking before each tool call.
function codexBlock(head, bin, approve) {
  return [
    head,
    'command = ' + JSON.stringify(fwd(nodePath())),
    'args = [' + JSON.stringify(fwd(bin)) + ', "mcp"]',
    'tool_timeout_sec = 900',
  ]
    .concat(approve ? ['default_tools_approval_mode = "approve"', '', '[mcp_servers.' + NAME + '.tools.godkit_delegate]', 'approval_mode = "prompt"'] : [])
    .concat([''])
    .join('\n')
}

// Whether the user has opted in to godkit's own MCP tools running without a prompt in Codex.
function codexApprove(env) {
  const e = env || process.env
  if (e.GODKIT_CODEX_APPROVE === '1' || e.GODKIT_CODEX_APPROVE === '0') return e.GODKIT_CODEX_APPROVE === '1'
  try {
    const lazy = require('./lazy')
    return lazy.readConfigRecord(lazy.configPath()).value.codexApprove === true
  } catch {
    return false
  }
}

// Codex: a [mcp_servers.godkit] table in config.toml, edited as text so nothing else is reformatted.
/** @param {string|null} raw @param {boolean} uninstall @param {string} bin @param {boolean} [approve] @returns {string|null} */
function applyToml(raw, uninstall, bin, approve) {
  const lines = String(raw || '').split('\n')
  const head = '[mcp_servers.' + NAME + ']'
  const at = lines.findIndex((l) => l.trim() === head)
  if (at >= 0) {
    // Our table and every table under it ([mcp_servers.godkit.tools.*]), up to the next table that is not ours.
    const own = '[mcp_servers.' + NAME + '.'
    let end = at + 1
    while (end < lines.length && (!lines[end].trim().startsWith('[') || lines[end].trim().startsWith(own))) end++
    if (!lines.slice(at, end).some((l) => fwd(l).includes('bin/godkit.js'))) throw new Error('a [' + head.slice(1) + ' table already exists and is not ours')
    lines.splice(at, end - at)
  } else if (uninstall) return null
  let text = lines.join('\n')
  if (!uninstall) {
    text = text.replace(/\n*$/, '\n') + '\n' + codexBlock(head, bin, approve)
  }
  return text === raw ? null : text
}

function registerFiles(action, dryRun, bin, env) {
  const results = []
  for (const [tool, file, format] of mcpTargets(env)) {
    try {
      const raw = readRaw(file)
      if (action === 'uninstall' && raw === null) continue
      const next = (format === 'json' ? applyJson : applyToml)(raw, action === 'uninstall', bin, codexApprove(env))
      if (next !== null && !dryRun) atomicWriteFile(file, next, { expectedRaw: raw, backup: true })
      results.push({ tool, file, changed: next !== null })
    } catch (error) {
      results.push({ tool, file, error: error.message })
    }
  }
  return results
}

function claudeFile(env) {
  const e = env || process.env
  const home = e.HOME || e.USERPROFILE || os.homedir()
  if (e.GODKIT_NO_CLAUDE_CLI || !(e.CLAUDE_CONFIG_DIR || fs.existsSync(path.join(home, '.claude')) || fs.existsSync(path.join(home, '.claude.json')))) return null
  return path.join(home, '.claude.json')
}

// The same owned-entry merge and atomic compare-and-swap used by other JSON hosts. This also
// works for GUI-only Claude installs and records writes for transactional recovery.
function registerClaude(action, dryRun, bin, env) {
  const file = claudeFile(env)
  if (!file) return null
  try {
    const raw = readRaw(file)
    const next = applyJson(raw, action === 'uninstall', bin)
    if (next !== null && !dryRun) atomicWriteFile(file, next, { expectedRaw: raw, backup: true })
    return { tool: 'claude', file, changed: next !== null }
  } catch (error) { return { tool: 'claude', file, error: error.message } }
}

// True only when every detected host, including GUI-only Claude, points at this installation.
function mcpReady(bin, env) {
  const claude = claudeFile(env)
  if (claude) {
    try { if (applyJson(readRaw(claude), false, bin) !== null) return false } catch { return false }
  }
  return mcpTargets(env).every(([, file, format]) => {
    try {
      return (format === 'json' ? applyJson : applyToml)(readRaw(file), false, bin, codexApprove(env)) === null
    } catch {
      return false // report an unreadable/foreign configuration; never call it ready
    }
  })
}

function registerMcp(action, dryRun, bin, env) {
  const results = registerFiles(action, dryRun, bin, env)
  const e = env || process.env
  if (claudeFile(e)) {
    const claude = registerClaude(action, dryRun, bin, e)
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
    'BIN=' + shellQuote(fwd(bin)) + '\n' +
    'NODE=' + shellQuote(fwd(nodePath())) + '\n' +
    '[ -f "$BIN" ] || exit 0\n' +
    '[ -x "$NODE" ] || exit 0\n' +
    'exec "$NODE" "$BIN" check-staged\n'
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

module.exports = { codexApprove, mcpReady, mcpTargets, applyJson, applyToml, registerMcp, githook, hookBody, MARK }
