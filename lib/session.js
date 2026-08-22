'use strict'
// Small, host-neutral primitives for hook input and per-session runtime state. Raw host IDs never
// become path components; state lives only below a Godkit-owned directory and is replaced atomically.

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const NAMESPACES = new Set(['lazy', 'work'])
const SAFE_LEAF = /^[a-z0-9][a-z0-9.-]{0,127}$/i

function warning(label, error) {
  const message = error && error.message ? error.message : String(error || 'unknown error')
  process.stderr.write('godkit ' + label + ': ' + message.replace(/[\r\n]+/g, ' ') + '\n')
}

function readHookInput(label) {
  let raw
  try {
    raw = fs.readFileSync(0, 'utf8')
  } catch (error) {
    warning(label, error)
    return {}
  }
  if (!raw.trim()) return {}
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('hook input must be a JSON object')
    }
    return value
  } catch (error) {
    warning(label, new Error('invalid hook input; ignored (' + error.message + ')'))
    return {}
  }
}

function sessionId(input) {
  const raw = typeof input === 'string' ? input : input && (input.session_id || input.sessionId)
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  return value && value.length <= 4096 ? value : null
}

function toolUseId(input) {
  if (!input || typeof input !== 'object') return null
  const raw = input.tool_use_id || input.tool_call_id
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  return value && value.length <= 4096 ? value : null
}

function hashId(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex')
}

function runtimeStateRoot(env, home) {
  const e = env || process.env
  const base =
    e.PLUGIN_DATA ||
    e.CLAUDE_PLUGIN_DATA ||
    e.CODEX_HOME ||
    e.CLAUDE_CONFIG_DIR ||
    path.join(home || os.homedir(), '.claude')
  return path.resolve(base, 'godkit', 'state')
}

function statePath(namespace, input, leaf, env) {
  if (!NAMESPACES.has(namespace)) throw new Error('unknown state namespace: ' + namespace)
  const sid = sessionId(input)
  if (!sid) throw new Error('missing session_id; session state was not changed')
  const name = leaf || 'state.json'
  if (!SAFE_LEAF.test(name)) throw new Error('unsafe state filename')
  return path.join(runtimeStateRoot(env), namespace, hashId(sid), name)
}

function readRaw(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

function atomicWriteFile(file, body, options) {
  const opts = options || {}
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const temp = path.join(dir, '.' + path.basename(file) + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp')
  let fd
  try {
    fd = fs.openSync(temp, 'wx', 0o600)
    fs.writeFileSync(fd, body, 'utf8')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined

    if (Object.prototype.hasOwnProperty.call(opts, 'expectedRaw')) {
      const current = readRaw(file)
      if (current !== opts.expectedRaw) throw new Error('file changed while it was being updated; left untouched')
    }
    if (opts.backup && opts.expectedRaw !== null && opts.expectedRaw !== undefined) {
      fs.copyFileSync(file, file + '.bak')
    }
    fs.renameSync(temp, file)
  } catch (error) {
    try {
      if (fd !== undefined) fs.closeSync(fd)
    } catch {
      /* best effort */
    }
    try {
      fs.unlinkSync(temp)
    } catch {
      /* best effort */
    }
    throw error
  }
}

function readState(namespace, input, leaf, env) {
  const file = statePath(namespace, input, leaf, env)
  const raw = readRaw(file)
  if (raw === null) return null
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('invalid Godkit session state at ' + file)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid Godkit session state at ' + file)
  }
  return value
}

function writeState(namespace, input, value, leaf, env) {
  const file = statePath(namespace, input, leaf, env)
  atomicWriteFile(file, JSON.stringify(value, null, 2) + '\n')
  return file
}

function removeState(namespace, input, leaf, env) {
  const file = statePath(namespace, input, leaf, env)
  try {
    fs.unlinkSync(file)
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error
  }
}

function clearNamespace(namespace, input, env) {
  const file = statePath(namespace, input, 'state.json', env)
  const base = runtimeStateRoot(env)
  const target = path.dirname(file)
  const rel = path.relative(base, target)
  if (!rel || path.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + path.sep)) {
    throw new Error('refused unsafe session-state cleanup target')
  }
  fs.rmSync(target, { recursive: true, force: true })
}

function clearSession(input, env) {
  if (!sessionId(input)) throw new Error('missing session_id; no session state was cleared')
  for (const namespace of NAMESPACES) clearNamespace(namespace, input, env)
}

module.exports = {
  warning,
  readHookInput,
  sessionId,
  toolUseId,
  hashId,
  runtimeStateRoot,
  statePath,
  readRaw,
  atomicWriteFile,
  readState,
  writeState,
  removeState,
  clearNamespace,
  clearSession,
}
