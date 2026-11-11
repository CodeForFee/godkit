'use strict'
// Configuration is not execution evidence. The local MCP probe establishes only that the
// package can serve the protocol, not that an IDE has loaded it or approved its hooks.
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const install = require('./install')
const { atomicWriteFile, readRaw } = require('./session')

const ROOT = path.resolve(__dirname, '..')
const HOSTS = ['claude', 'codex', 'cursor', 'antigravity']
const FEATURES = ['skills', 'roles', 'hooks', 'mcp', 'native_agents', 'peer_messaging']
const object = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const feature = (status, message, extra) => Object.assign({ status, message }, extra)
const forward = (v) => String(v).replace(/\\/g, '/')
const absolute = (v) => typeof v === 'string' && (path.isAbsolute(v) || path.win32.isAbsolute(v))

/** @param {NodeJS.ProcessEnv} [env] */
function locations(env) {
  const e = env || process.env
  const home = e.HOME || e.USERPROFILE || os.homedir()
  const godkit = e.GODKIT_HOME || path.join(home, '.godkit')
  const claude = e.CLAUDE_CONFIG_DIR || path.join(home, '.claude')
  const codex = e.CODEX_HOME || path.join(home, '.codex')
  const cursor = e.CURSOR_HOME || path.join(home, '.cursor')
  const gemini = e.GEMINI_HOME || path.join(home, '.gemini')
  return {
    home, godkit,
    claude: { dir: claude, hooks: path.join(claude, 'settings.json'), mcp: path.join(home, '.claude.json') },
    codex: { dir: codex, hooks: path.join(codex, 'hooks.json'), mcp: path.join(codex, 'config.toml') },
    cursor: { dir: cursor, hooks: path.join(cursor, 'hooks.json'), mcp: path.join(cursor, 'mcp.json') },
    antigravity: { dir: path.join(gemini, 'antigravity'), hooks: path.join(gemini, 'config', 'hooks.json'), mcp: path.join(gemini, 'config', 'mcp_config.json') },
  }
}

function json(file) {
  const raw = readRaw(file)
  if (raw === null) return null
  const value = JSON.parse(raw.replace(/^\uFEFF/, ''))
  if (!object(value)) throw new Error('expected a JSON object')
  return value
}

function ledger(env) {
  const file = path.join(locations(env).godkit, 'capabilities.json')
  const raw = readRaw(file)
  const value = raw === null ? null : JSON.parse(raw.replace(/^\uFEFF/, ''))
  if (value && (value.schemaVersion !== 1 || !Array.isArray(value.entries))) throw new Error('invalid capability evidence ledger')
  return { file, raw, entries: value ? value.entries : [] }
}

// Fingerprint current bytes, not mtimes: reinstalling an identical package must not erase
// genuine observations, while edited definitions must never inherit their predecessor's proof.
function assetDigest(options) {
  const o = options || {}
  const root = path.resolve(o.root || ROOT)
  const cwd = path.resolve(o.cwd || process.cwd())
  const target = locations(o.env)[o.host]
  const files = []
  if (o.feature === 'hooks' || o.feature === 'mcp') files.push(target[o.feature])
  if (o.feature === 'skills') {
    const base = o.host === 'antigravity' ? path.join(target.dir, 'skills/godkit') : path.join(cwd, o.host === 'claude' ? '.claude/skills' : '.agents/skills')
    for (const name of namesIn(path.join(root, 'skills'))) files.push(path.join(base, name))
  }
  if (o.feature === 'roles' || o.feature === 'native_agents' || o.feature === 'peer_messaging') {
    const base = path.join(cwd, o.host === 'claude' ? '.claude/agents' : '.codex/agents')
    for (const name of namesIn(path.join(root, 'agents'), '.md')) files.push(path.join(base, name + (o.host === 'claude' ? '.md' : '.toml')))
  }
  if (o.feature === 'native_agents' || o.feature === 'peer_messaging') {
    files.push(path.join(cwd, 'AGENTS.md'))
    const extra = { claude: 'CLAUDE.md', cursor: '.cursor/rules/godkit.mdc', antigravity: '.agents/rules/godkit.md' }[o.host]
    if (extra) files.push(path.join(cwd, extra))
  }
  const hash = crypto.createHash('sha256')
  let count = 0
  let bytes = 0
  const visit = (file, label) => {
    hash.update(label + '\0')
    let stat
    try { stat = fs.lstatSync(file) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      hash.update('missing\0')
      return
    }
    if (stat.isSymbolicLink()) throw new Error('capability evidence cannot fingerprint linked assets')
    if (++count > 5000 || (bytes += stat.isFile() ? stat.size : 0) > 32 * 1024 * 1024) throw new Error('capability assets exceed the fingerprint budget')
    if (stat.isDirectory()) {
      hash.update('directory\0')
      for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name), label + '/' + name)
    } else if (stat.isFile()) {
      const value = fs.readFileSync(file)
      hash.update('file:' + value.length + '\0').update(value)
    } else throw new Error('capability assets must be regular files')
  }
  files.forEach((file, i) => visit(file, String(i)))
  return hash.digest('hex')
}

/** Record an explicit host-session observation. This is attributed self-report, not a
 * harness-verifiable audit. Never call this automatically from mocks or a local MCP probe. */
function recordEvidence(options) {
  const o = options || {}
  if (!HOSTS.includes(o.host) || !FEATURES.includes(o.feature)) throw new Error('unknown host or capability')
  if (o.source !== 'host-session') throw new Error('evidence source must be an observed host-session')
  for (const key of ['surface', 'hostVersion', 'session']) {
    if (typeof o[key] !== 'string' || !o[key].trim() || /[\r\n]/.test(o[key]) || o[key].length > 200) throw new Error(key + ' is required for host evidence')
  }
  const observedAt = o.observedAt || new Date().toISOString()
  const time = Date.parse(observedAt)
  if (!Number.isFinite(time) || time > Date.now() + 60000) throw new Error('invalid observation timestamp')
  const packageRoot = path.resolve(o.root || ROOT)
  const packageVersion = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version
  const entry = {
    host: o.host, feature: o.feature, surface: o.surface.trim(), hostVersion: o.hostVersion.trim(),
    session: o.session.trim(), source: o.source, observedAt: new Date(time).toISOString(),
    project: path.resolve(o.cwd || process.cwd()), packageVersion,
    assetDigest: assetDigest(o),
  }
  const current = ledger(o.env)
  const same = (e) => ['host', 'feature', 'surface', 'hostVersion', 'project', 'packageVersion'].every((k) => e[k] === entry[k])
  const entries = current.entries.filter((e) => !same(e)).concat(entry).slice(-128)
  fs.mkdirSync(path.dirname(current.file), { recursive: true })
  atomicWriteFile(current.file, JSON.stringify({ schemaVersion: 1, entries }, null, 2) + '\n', { expectedRaw: current.raw })
  return entry
}

/** @param {{root?:string,cwd?:string,env?:NodeJS.ProcessEnv,node?:string,timeoutMs?:number}} [options] */
function probeMcp(options) {
  const o = options || {}
  const root = path.resolve(o.root || ROOT)
  const timeoutMs = Math.max(20, Math.min(Number(o.timeoutMs) || 4000, 30000))
  const started = Date.now()
  return new Promise((resolve) => {
    let child
    let result
    let buffer = ''
    let bytes = 0
    let initialized = false
    let stderrBytes = 0
    let timer
    const finish = (value) => {
      if (result) return
      result = Object.assign(value, { durationMs: Date.now() - started, scope: 'local-server' })
      clearTimeout(timer)
      if (!child) return resolve(result)
      child.stdin.end()
      child.kill()
    }
    try {
      child = spawn(o.node || process.execPath, [path.join(root, 'bin', 'godkit.js'), 'mcp'], {
        cwd: o.cwd || root, env: { ...process.env, ...(o.env || {}) }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      })
    } catch {
      finish(feature('error', 'Could not start the local MCP server.'))
      return
    }
    timer = setTimeout(() => finish(feature('error', 'Local MCP health check timed out.')), timeoutMs)
    child.stdin.on('error', () => {}) // a rejected/missing child closes stdin before our request
    child.on('error', () => finish(feature('error', 'Could not start the local MCP server.')))
    child.stderr.on('data', (chunk) => { stderrBytes += chunk.length }) // never expose stderr contents
    child.stdout.on('data', (chunk) => {
      if (result) return
      bytes += chunk.length
      if (bytes > 1024 * 1024) return finish(feature('error', 'Local MCP output exceeded the health-check limit.'))
      buffer += chunk.toString('utf8')
      let at
      while (!result && (at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at).trim()
        buffer = buffer.slice(at + 1)
        if (!line) continue
        let message
        try { message = JSON.parse(line) } catch { return finish(feature('error', 'Local MCP server emitted non-protocol output.')) }
        if (!object(message) || message.jsonrpc !== '2.0' || message.error) return finish(feature('error', 'Local MCP server returned an invalid protocol response.'))
        if (message.id === 1 && !initialized) {
          if (!object(message.result) || typeof message.result.protocolVersion !== 'string' || !object(message.result.capabilities) || !object(message.result.capabilities.tools)) return finish(feature('error', 'Local MCP initialization did not advertise tools.'))
          initialized = true
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
        } else if (message.id === 2 && initialized) {
          const tools = message.result && message.result.tools
          if (!Array.isArray(tools) || !tools.length || !tools.every((t) => object(t) && typeof t.name === 'string' && object(t.inputSchema))) return finish(feature('error', 'Local MCP tool discovery failed.'))
          finish(feature('verified', 'Local MCP initialize and tool discovery succeeded; host connection is not verified.', { toolCount: tools.length, stderrBytes }))
        } else if (message.id !== undefined) {
          finish(feature('error', 'Local MCP server returned an unexpected response.'))
        }
      }
    })
    child.on('close', () => {
      clearTimeout(timer)
      resolve(result || feature('error', 'Local MCP server exited before completing the health check.', { durationMs: Date.now() - started, scope: 'local-server' }))
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'godkit-doctor', version: '1' } } }) + '\n')
  })
}

function directoryFeature(base, names, suffix) {
  if (!names.length) return feature('error', 'The package does not contain the expected definitions.')
  const present = names.filter((name) => fs.existsSync(path.join(base, name + suffix)))
  return feature(present.length === names.length ? 'configured' : 'needs_action', present.length + '/' + names.length + ' definitions are present.', { path: base, present: present.length, expected: names.length })
}

function namesIn(dir, extension) {
  try { return fs.readdirSync(dir).filter((name) => extension ? name.endsWith(extension) : fs.statSync(path.join(dir, name)).isDirectory()).map((name) => extension ? name.slice(0, -extension.length) : name) } catch { return [] }
}

function mcpConfiguration(host, file) {
  let entry
  if (host === 'codex') {
    const raw = readRaw(file)
    if (raw === null) return feature('needs_action', 'MCP is not registered.', { path: file })
    const block = raw.match(/^\[mcp_servers\.godkit\][ \t]*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)
    if (!block) return feature('needs_action', 'No Godkit MCP table was found.', { path: file })
    const value = (key) => {
      const line = block[1].match(new RegExp('^' + key + '\\s*=\\s*(.+)$', 'm'))
      if (!line) throw new Error('incomplete Godkit MCP table')
      return JSON.parse(line[1].trim())
    }
    entry = { command: value('command'), args: value('args') }
  } else {
    const doc = json(file)
    entry = doc && doc.mcpServers && doc.mcpServers.godkit
    if (!entry) return feature('needs_action', 'MCP is not registered.', { path: file })
  }
  if (!object(entry) || typeof entry.command !== 'string' || !Array.isArray(entry.args) || !entry.args.every((a) => typeof a === 'string')) throw new Error('invalid Godkit MCP entry')
  const bin = entry.args.find((a) => forward(a).endsWith('/bin/godkit.js'))
  if (!bin) return feature('error', 'An MCP entry named godkit is not owned by Godkit; it will not be replaced.', { path: file })
  if (!absolute(entry.command)) return feature('needs_action', 'MCP uses a PATH-dependent runtime; re-register with an absolute runtime path.', { path: file })
  if (!fs.existsSync(entry.command) || !fs.existsSync(bin)) return feature('needs_action', 'The configured MCP runtime or package path no longer exists.', { path: file })
  return feature('configured', 'MCP configuration is present; no host-session connection has been observed.', { path: file })
}

function safeCheck(callback, file) {
  try { return callback() } catch (error) {
    // Report the category, not raw file contents or parser excerpts which may include secrets.
    return feature('error', error.code === 'EACCES' || error.code === 'EPERM' ? 'Configuration could not be read; permissions must be resolved before repair.' : 'Configuration is malformed or unreadable; it was not changed.', { path: file })
  }
}

/** Inspect local setup without modifying host configuration or launching AI CLI agents. */
async function inspect(options) {
  const o = options || {}
  const env = o.env || process.env
  const root = path.resolve(o.root || ROOT)
  const cwd = path.resolve(o.cwd || process.cwd())
  const dirs = locations(env)
  const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  const report = {
    schemaVersion: 1, packageVersion, checkedAt: new Date().toISOString(), status: 'needs_action', ready: false,
    runtime: feature('verified', 'Godkit is executing with this Node runtime.', { executable: process.execPath, version: process.versions.node }),
    project: feature('configured', 'Shared project memory and rules are present.', { path: cwd }),
    mcp: await probeMcp({ root, cwd, env, timeoutMs: o.timeoutMs }), hosts: [], errors: [],
  }
  const memory = ['BOARD.md', 'THREAD.md'].every((f) => fs.existsSync(path.join(cwd, '.agent', f)))
  if (!memory || !fs.existsSync(path.join(cwd, 'AGENTS.md'))) report.project = feature('needs_action', 'Run Godkit init for this project.', { path: cwd })
  let entries = []
  let seen = {}
  try { entries = ledger(env).entries.filter(object) } catch { report.errors.push('Capability evidence is malformed or unreadable; no feature was promoted from it.') }
  try { seen = json(path.join(dirs.godkit, 'seen.json')) || {} } catch { report.errors.push('Hook execution evidence is malformed or unreadable.') }
  const skills = namesIn(path.join(root, 'skills'))
  const roles = namesIn(path.join(root, 'agents'), '.md')
  for (const host of HOSTS) {
    const target = dirs[host]
    const installed = fs.existsSync(target.dir) || fs.existsSync(target.hooks) || fs.existsSync(target.mcp)
    const row = { host, installed, status: 'needs_action', ready: false, message: installed ? 'Host configuration was detected; executable availability is established only by host-session evidence.' : 'No local host configuration was detected; application installation was not probed.', features: {} }
    if (!installed) { report.hosts.push(row); continue }
    row.features.skills = host === 'cursor'
      ? feature('unsupported', 'This adapter supplies rules; native skill discovery is not verified.')
      : directoryFeature(host === 'antigravity' ? path.join(target.dir, 'skills', 'godkit') : path.join(cwd, host === 'claude' ? '.claude' : '.agents', 'skills'), skills, '/SKILL.md')
    row.features.roles = host === 'claude' || host === 'codex'
      ? directoryFeature(path.join(cwd, host === 'claude' ? '.claude' : '.codex', 'agents'), roles, host === 'claude' ? '.md' : '.toml')
      : feature('unsupported', 'Custom role definition format is not verified for this host.')
    row.features.hooks = safeCheck(() => {
      const doc = json(target.hooks)
      const count = install.ourHandlers(doc, host).length
      const expected = install.expectedCount(host)
      const value = feature(count >= expected ? 'configured' : 'needs_action', count + '/' + expected + ' Godkit hook registrations are present.', { path: target.hooks })
      if (value.status === 'configured') {
        const modified = fs.statSync(target.hooks).mtimeMs
        const observations = Object.entries(seen[host] || {}).filter(([, e]) => object(e) && Number.isFinite(Date.parse(e.at)) && Date.parse(e.at) >= modified)
        if (observations.length) return feature('verified', 'A session hook ran after this hook configuration was written.', { path: target.hooks, evidence: { source: 'session-hook-ledger', surface: observations[0][0], observedAt: observations[0][1].at } })
        value.message += host === 'codex' ? ' Review hooks in Codex, then start a session to verify execution.' : ' Start a host session to verify execution.'
      }
      return value
    }, target.hooks)
    row.features.mcp = safeCheck(() => mcpConfiguration(host, target.mcp), target.mcp)
    for (const name of ['native_agents', 'peer_messaging']) row.features[name] = feature('needs_action', 'No real host-session execution evidence is recorded.')
    const relevant = entries.filter((e) => e.source === 'host-session' && e.host === host && e.project === cwd && e.packageVersion === packageVersion && typeof e.hostVersion === 'string' && typeof e.surface === 'string' && typeof e.session === 'string' && Number.isFinite(Date.parse(e.observedAt)))
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
    const latest = relevant[0]
    if (latest) {
      row.verifiedFor = { hostVersion: latest.hostVersion, surface: latest.surface }
      for (const name of FEATURES) {
        const found = relevant.find((e) => e.feature === name && e.surface === latest.surface && e.hostVersion === latest.hostVersion)
        const prior = row.features[name]
        if (found && (prior.status === 'configured' || (name === 'native_agents' || name === 'peer_messaging') && prior.status === 'needs_action')) {
          let matches = false
          try { matches = typeof found.assetDigest === 'string' && found.assetDigest === assetDigest({ cwd, root, env, host, feature: name }) } catch {
            row.features[name] = feature('error', 'Relevant capability assets could not be fingerprinted; existing evidence was not reused.')
            continue
          }
          if (matches) row.features[name] = feature('verified', 'Reported as successfully exercised in the identified host session with matching current assets.', { evidence: found, attribution: 'host-session self-report; not a harness-verifiable audit' })
          else row.features[name].message += ' Existing evidence does not match current assets; exercise this capability again.'
        }
      }
    }
    const states = Object.values(row.features).map((f) => f.status)
    row.ready = states.every((s) => s === 'verified')
    row.status = row.ready ? 'verified' : states.includes('error') ? 'error' : states.includes('needs_action') || states.includes('configured') ? 'needs_action' : 'unsupported'
    report.hosts.push(row)
  }
  const installed = report.hosts.filter((h) => h.installed)
  report.ready = report.runtime.status === 'verified' && report.project.status === 'configured' && report.mcp.status === 'verified' && installed.length > 0 && installed.every((h) => h.ready) && !report.errors.length
  report.status = report.ready ? 'verified' : report.errors.length || report.mcp.status === 'error' || installed.some((h) => h.status === 'error') ? 'error' : 'needs_action'
  return report
}

/** Repairs are explicit and delegated to the caller's existing own-only installer. */
async function fix(options) {
  const o = options || {}
  if (typeof o.repair !== 'function') throw new Error('doctor fix requires an explicit repair callback')
  let repaired = false
  let failure = false
  try { await o.repair(); repaired = true } catch { failure = true }
  const report = await inspect(o)
  report.repair = { attempted: true, completed: repaired }
  if (failure) {
    report.errors.push('Repair did not complete; review installer diagnostics. Existing configuration was not assumed repaired.')
    report.status = 'error'
    report.ready = false
  }
  return report
}

module.exports = { inspect, fix, probeMcp, recordEvidence, locations, HOSTS, FEATURES }
