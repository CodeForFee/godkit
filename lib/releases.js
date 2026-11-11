'use strict'
// Immutable, checked package copies; only a successful configuration can become current.
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const { real, isInside } = require('./paths')
const { atomicWriteFile, readRaw } = require('./session')
const journal = require('./install-journal')

const OWNER = 'godkit-release-v1'
const homeOf = (o) => path.resolve(o.home || process.env.GODKIT_HOME || path.join(os.homedir(), '.godkit'))
const stateFile = (home) => path.join(home, 'active.json')

function bounded(home, file) {
  const target = path.resolve(file)
  if (target === home || !isInside(home, target)) throw new Error('release path escapes Godkit home')
  let parent = path.dirname(target)
  while (!fs.existsSync(parent) && parent !== path.dirname(parent)) parent = path.dirname(parent)
  if (!isInside(real(home) || home, real(parent) || parent)) throw new Error('release path follows a link outside Godkit home')
  return target
}

function remove(home, file) {
  const target = bounded(home, file)
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('refusing linked release path')
  fs.rmSync(target, { recursive: true, force: true })
}

function locked(home, fn) {
  fs.mkdirSync(home, { recursive: true })
  const lock = path.join(home, 'install.lock')
  try { fs.mkdirSync(lock) } catch (e) {
    if (e.code === 'EEXIST') throw new Error('another Godkit installation is active; retry when it finishes')
    throw e
  }
  try { return fn() } finally { fs.rmdirSync(lock) }
}

function readState(home) {
  const raw = readRaw(stateFile(home))
  if (!raw) return { owner: OWNER, current: null, previous: null }
  const state = JSON.parse(raw)
  if (!state || state.owner !== OWNER) throw new Error('active release state is not owned by Godkit')
  return state
}

function packageFiles(source) {
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'))
  if (pkg.name !== '@codeforfee/godkit' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(pkg.version || '')) throw new Error('not a valid Godkit release')
  if (!Array.isArray(pkg.files)) throw new Error('Godkit package has no files allowlist')
  const files = new Set(['package.json'])
  const visit = (relative) => {
    if (relative.split(/[\\/]/).some((part) => part.includes('DebugEcho') || part.includes('debug_echo'))) throw new Error('release contains an excluded filename')
    const absolute = path.resolve(source, relative)
    if (!isInside(source, absolute)) throw new Error('package allowlist escapes source')
    const stat = fs.lstatSync(absolute)
    if (stat.isSymbolicLink()) throw new Error('release package must not contain symbolic links: ' + relative)
    if (stat.isDirectory()) {
      for (const item of fs.readdirSync(absolute).sort()) visit(path.join(relative, item))
    } else if (stat.isFile()) files.add(relative)
  }
  for (const entry of pkg.files) {
    if (typeof entry !== 'string' || path.isAbsolute(entry) || /(^|[\\/])\.\.([\\/]|$)/.test(entry)) throw new Error('unsafe package allowlist')
    if (fs.existsSync(path.join(source, entry))) visit(entry)
  }
  return { pkg, files: [...files].sort() }
}

function fingerprint(source, files) {
  const hash = crypto.createHash('sha256')
  for (const file of files) hash.update(file.replace(/\\/g, '/') + '\0').update(fs.readFileSync(path.join(source, file))).update('\0')
  return hash.digest('hex')
}

function validateRelease(root, node, version) {
  const bin = path.join(root, 'bin', 'godkit.js')
  const run = (args, input) => spawnSync(node, [bin, ...args], { encoding: 'utf8', input, timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, GODKIT_FORCE_STABLE: '0' } })
  const v = run(['--version'])
  if (v.error || v.status !== 0 || v.stdout.trim() !== version) throw new Error('staged Godkit version check failed: ' + (v.error ? v.error.message : v.stderr.trim()))
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'godkit-installer', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]
  const mcp = run(['mcp'], messages.map((m) => JSON.stringify(m)).join('\n') + '\n')
  let replies
  try { replies = mcp.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) } catch { throw new Error('staged MCP returned invalid protocol output') }
  if (mcp.error || mcp.status !== 0 || !replies.some((r) => r.id === 1 && r.result && r.result.serverInfo && r.result.serverInfo.name === 'godkit') || !replies.some((r) => r.id === 2 && r.result && Array.isArray(r.result.tools) && r.result.tools.length)) throw new Error('staged MCP initialize/tools-list check failed')
}

function stageRelease(source, options) {
  const o = options || {}
  const home = homeOf(o)
  const from = real(path.resolve(source))
  if (!from) throw new Error('release source does not exist')
  const { pkg, files } = packageFiles(from)
  const digest = fingerprint(from, files)
  const root = path.join(home, 'releases', pkg.version + '-' + digest.slice(0, 12))
  const node = path.resolve(o.node || process.execPath)
  return locked(home, () => {
    bounded(home, root)
    if (fs.existsSync(root)) {
      if (fs.lstatSync(root).isSymbolicLink()) throw new Error('refusing linked release path')
      const receipt = JSON.parse(fs.readFileSync(path.join(root, '.godkit-release.json'), 'utf8'))
      if (receipt.owner !== OWNER || receipt.digest !== digest || fingerprint(root, files) !== digest) throw new Error('existing release differs or is not owned by Godkit')
    } else {
      const temp = root + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex')
      try {
        fs.mkdirSync(temp, { recursive: true })
        for (const file of files) {
          const dest = path.join(temp, file)
          fs.mkdirSync(path.dirname(dest), { recursive: true })
          fs.copyFileSync(path.join(from, file), dest)
        }
        fs.writeFileSync(path.join(temp, '.godkit-release.json'), JSON.stringify({ owner: OWNER, digest, version: pkg.version }) + '\n')
        validateRelease(temp, node, pkg.version)
        fs.renameSync(temp, root)
      } finally { if (fs.existsSync(temp)) remove(home, temp) }
    }
    validateRelease(root, node, pkg.version)
    return { root, version: pkg.version, node }
  })
}

function capture(file, records) {
  if (!fs.existsSync(file)) { records.set(file, null); return }
  const stat = fs.lstatSync(file)
  if (stat.isSymbolicLink()) { records.set(file, { link: fs.readlinkSync(file) }); return }
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(file)) capture(path.join(file, name), records)
  } else if (stat.isFile()) records.set(file, fs.readFileSync(file))
}

function snapshots(files) {
  const roots = [...new Set(files || [])].map((file) => path.resolve(file))
  const records = new Map()
  for (const file of roots) capture(file, records)
  return { roots, records }
}

function restore(snapshot, journalFile) {
  const failures = []
  const lines = fs.readFileSync(journalFile, 'utf8').trim().split('\n')
  const writes = lines.slice(1).map((line) => JSON.parse(line))
  const attributable = new Set(writes.map((write) => write.file))
  for (const write of writes.reverse()) {
    try {
      if (write.kind === 'link') {
        let stat
        try { stat = fs.lstatSync(write.file) } catch (error) { if (error.code !== 'ENOENT') throw error }
        const target = stat && stat.isSymbolicLink() ? fs.readlinkSync(write.file) : null
        if (stat && stat.isSymbolicLink() && target === write.beforeTarget) continue
        if (write.afterTarget !== null && (!stat || !stat.isSymbolicLink() || target !== write.afterTarget)) throw new Error('link changed concurrently; preserved')
        if (stat && stat.isSymbolicLink()) fs.unlinkSync(write.file)
        else if (stat && stat.isDirectory()) removeEmptyTree(write.file)
        else if (stat) throw new Error('link path changed concurrently; preserved')
        if (write.beforeTarget !== null) fs.symlinkSync(write.beforeTarget, write.file, write.type || undefined)
        continue
      }
      if (fs.existsSync(write.file) && (fs.lstatSync(write.file).isSymbolicLink() || fs.statSync(write.file).isDirectory())) throw new Error('configuration path changed type; preserved')
      const current = fs.existsSync(write.file) ? fs.readFileSync(write.file) : null
      const before = write.before === null ? null : Buffer.from(write.before, 'base64')
      if (journal.hash(current) === journal.hash(before)) continue
      if (journal.hash(current) !== write.afterHash) throw new Error('configuration changed concurrently; preserved')
      if (before === null) fs.rmSync(write.file, { force: true })
      else atomicWriteFile(write.file, before, { expectedRaw: current === null ? null : current.toString('utf8') })
    } catch (error) { failures.push(write.file + ': ' + error.message) }
  }
  const after = new Map()
  for (const root of snapshot.roots) capture(root, after)
  const files = new Set([...snapshot.records.keys(), ...after.keys()])
  for (const file of files) {
    if (attributable.has(file)) continue
    const before = snapshot.records.get(file)
    const observed = after.get(file)
    if ((!before && !observed) || (Buffer.isBuffer(before) && Buffer.isBuffer(observed) && before.equals(observed)) || (before && observed && before.link && before.link === observed.link)) continue
    failures.push(file + ': changed without installation write evidence; preserved')
  }
  if (failures.length) throw new Error('configuration restore failed: ' + failures.join('; '))
}

function removeEmptyTree(dir) {
  for (const name of fs.readdirSync(dir)) {
    const child = path.join(dir, name)
    const stat = fs.lstatSync(child)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('concurrent file prevents link restoration; preserved')
    removeEmptyTree(child)
  }
  fs.rmdirSync(dir)
}

function activateRelease(staged, options) {
  const o = options || {}
  const home = homeOf(o)
  return locked(home, () => {
    const root = bounded(home, staged.root)
    if (fs.lstatSync(root).isSymbolicLink()) throw new Error('refusing linked release path')
    const receipt = JSON.parse(fs.readFileSync(path.join(root, '.godkit-release.json'), 'utf8'))
    if (receipt.owner !== OWNER || receipt.version !== staged.version) throw new Error('release is not owned by Godkit')
    const packaged = packageFiles(root)
    if (fingerprint(root, packaged.files) !== receipt.digest) throw new Error('staged release changed after validation')
    const node = path.resolve(o.node || staged.node || process.execPath)
    validateRelease(root, node, staged.version)
    const beforeRaw = readRaw(stateFile(home))
    const prior = readState(home)
    const captured = snapshots(o.configFiles)
    const journalFile = path.join(home, '.install-journal-' + crypto.randomBytes(12).toString('hex'))
    const token = crypto.randomBytes(24).toString('hex')
    fs.writeFileSync(journalFile, JSON.stringify({ owner: journal.OWNER, token }) + '\n', { flag: 'wx', mode: 0o600 })
    fs.writeFileSync(journalFile + '.scope', JSON.stringify(captured.roots), { flag: 'wx', mode: 0o600 })
    const previousJournal = process.env.GODKIT_INSTALL_JOURNAL
    const previousToken = process.env.GODKIT_INSTALL_TOKEN
    process.env.GODKIT_INSTALL_JOURNAL = journalFile
    process.env.GODKIT_INSTALL_TOKEN = token
    try {
      if (o.configure) {
        const result = o.configure({ ...staged, root, node }, { journal: journalFile, token })
        if (result && typeof result.then === 'function') throw new Error('release configuration callback must be synchronous')
        if (result === false || (result && result.ok === false)) throw new Error('release configuration failed')
      }
      const current = { root, version: staged.version, node }
      const previous = prior.current && prior.current.root !== root ? prior.current : prior.previous
      const state = { owner: OWNER, current, previous: previous || null }
      atomicWriteFile(stateFile(home), JSON.stringify(state, null, 2) + '\n', { expectedRaw: beforeRaw })
      // Only retire a formerly active release, never another install's staged candidate.
      if (prior.previous && ![current.root, previous && previous.root].includes(prior.previous.root)) {
        try {
          const oldRoot = bounded(home, prior.previous.root)
          const oldReceipt = JSON.parse(fs.readFileSync(path.join(oldRoot, '.godkit-release.json'), 'utf8'))
          if (oldReceipt.owner === OWNER) remove(home, oldRoot)
        } catch (error) { state.cleanupWarning = error.message }
      }
      return state
    } catch (error) {
      delete process.env.GODKIT_INSTALL_JOURNAL
      delete process.env.GODKIT_INSTALL_TOKEN
      try { restore(captured, journalFile) } catch (restoreError) { error.message += '; ' + restoreError.message }
      throw error
    } finally {
      if (previousJournal === undefined) delete process.env.GODKIT_INSTALL_JOURNAL
      else process.env.GODKIT_INSTALL_JOURNAL = previousJournal
      if (previousToken === undefined) delete process.env.GODKIT_INSTALL_TOKEN
      else process.env.GODKIT_INSTALL_TOKEN = previousToken
      fs.rmSync(journalFile, { force: true })
      fs.rmSync(journalFile + '.scope', { force: true })
    }
  })
}

function rollbackRelease(options) {
  const o = options || {}
  const prior = readState(homeOf(o))
  if (!prior.previous) throw new Error('no previous Godkit release to restore')
  return activateRelease(prior.previous, o)
}

module.exports = { stageRelease, activateRelease, rollbackRelease, validateRelease, readState, OWNER }
