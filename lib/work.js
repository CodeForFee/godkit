'use strict'
// Session-owned evidence that a tool changed project files. Shell tools compare a before/after
// Git fingerprint; direct edit tools mark work only for successful paths outside .agent/.

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { git, isInside, real, samePath } = require('./paths')
const {
  clearNamespace,
  hashId,
  readState,
  removeState,
  toolUseId,
  writeState,
} = require('./session')

const PATHSPEC = ['--', '.', ':(exclude).agent', ':(exclude).agent/**']
const EDIT_TOOLS = new Set(['edit', 'write', 'apply_patch', 'notebookedit'])

function statusPaths(buffer) {
  const records = buffer.toString('utf8').split('\0')
  const out = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (!record || record.length < 4) continue
    const code = record.slice(0, 2)
    out.push(record.slice(3))
    if (/[RC]/.test(code)) i++ // porcelain -z emits the original rename/copy path next
  }
  return [...new Set(out)]
}

function agentRelative(rel) {
  const normalized = String(rel || '').replace(/\\/g, '/').replace(/^\.\//, '')
  return normalized === '.agent' || normalized.startsWith('.agent/')
}

function hashWorkingPath(hash, root, rel) {
  if (!rel || agentRelative(rel)) return
  const file = path.resolve(root, rel)
  if (!isInside(root, file)) return
  hash.update('\0path\0' + rel.replace(/\\/g, '/'))
  let stat
  try {
    stat = fs.lstatSync(file)
  } catch {
    hash.update('\0missing')
    return
  }
  hash.update('\0mode\0' + stat.mode)
  if (stat.isSymbolicLink()) {
    hash.update('\0link\0' + fs.readlinkSync(file))
    return
  }
  if (!stat.isFile()) {
    hash.update(stat.isDirectory() ? '\0directory' : '\0special')
    return
  }

  const fd = fs.openSync(file, 'r')
  const chunk = Buffer.alloc(64 * 1024)
  try {
    for (;;) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, null)
      if (!n) break
      hash.update(chunk.subarray(0, n))
    }
  } finally {
    fs.closeSync(fd)
  }
}

// The committed side hashes the non-.agent tree rather than HEAD itself, so an .agent-only
// checkpoint does not count as product work while a commit that lands source changes does.
function fingerprint(root) {
  const status = git(['status', '--porcelain=v1', '-z', '--untracked-files=all', ...PATHSPEC], root, null)
  if (!Buffer.isBuffer(status)) return null
  const tree = git(['ls-tree', '-r', '-z', 'HEAD', ...PATHSPEC], root, null)
  const hash = crypto.createHash('sha256')
  hash.update('tree\0')
  if (Buffer.isBuffer(tree)) hash.update(tree)
  else hash.update('unborn')
  hash.update('\0status\0')
  hash.update(status)
  for (const rel of statusPaths(status).sort()) hashWorkingPath(hash, root, rel)
  return hash.digest('hex')
}

function toolLeaf(payload) {
  const id = toolUseId(payload)
  if (!id) throw new Error('missing tool_use_id; work evidence was not changed')
  return 'tool-' + hashId(id) + '.json'
}

function captureBefore(payload, root) {
  const value = fingerprint(root)
  if (!value) return false
  writeState('work', payload, { root: path.resolve(root), fingerprint: value }, toolLeaf(payload))
  return true
}

function markWorked(payload, details) {
  const prior = readState('work', payload, 'state.json') || {}
  writeState('work', payload, {
    worked: true,
    firstAt: prior.firstAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reason: (details && details.reason) || prior.reason || 'tool changed project files',
    tool: (details && details.tool) || prior.tool || null,
  })
}

function finishAfter(payload, root) {
  const leaf = toolLeaf(payload)
  const before = readState('work', payload, leaf)
  if (!before) return false
  try {
    if (!samePath(before.root, root)) throw new Error('tool worktree changed between pre and post hooks')
    const after = fingerprint(root)
    if (!after) return false
    if (after !== before.fingerprint) {
      markWorked(payload, { reason: 'Git fingerprint changed', tool: payload.tool_name || 'Bash' })
      return true
    }
    return false
  } finally {
    removeState('work', payload, leaf)
  }
}

function didSessionWork(payload) {
  const state = readState('work', payload, 'state.json')
  return Boolean(state && state.worked)
}

function clearWork(payload) {
  clearNamespace('work', payload)
}

function toolSucceeded(payload) {
  const response = payload && payload.tool_response
  if (!response || typeof response !== 'object') return true // Claude PostToolUse is success-only
  if (response.isError === true || response.success === false || response.error) return false
  if (typeof response.exit_code === 'number' && response.exit_code !== 0) return false
  return true
}

function patchPaths(input) {
  const raw = typeof input === 'string' ? input : input && (input.patch || input.input)
  if (typeof raw !== 'string') return []
  const out = []
  const pattern = /^\*\*\* (?:Add|Update|Delete) File:\s*(.+?)\s*$/gm
  let match
  while ((match = pattern.exec(raw))) out.push(match[1])
  return out
}

function editPaths(payload) {
  const input = payload && payload.tool_input
  if (typeof input === 'string') return patchPaths(input)
  if (!input || typeof input !== 'object') return []
  const out = []
  for (const key of ['file_path', 'path', 'notebook_path']) {
    if (typeof input[key] === 'string' && input[key].trim()) out.push(input[key].trim())
  }
  return [...out, ...patchPaths(input)]
}

function projectEditPath(file, payload, context) {
  if (!file || file === '/dev/null') return false
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : context.worktreeRoot
  const resolved = path.isAbsolute(file) ? path.resolve(file) : path.resolve(cwd, file)
  // The roots are canonical, so the file has to be too. A host that hands us an 8.3 short path
  // would otherwise land outside every root and the edit would go unrecorded — invisible work,
  // which is the one thing the log exists to prevent. real() is null for a path that no longer
  // exists (a delete, an apply_patch naming a file not yet written), so keep the resolved form.
  const absolute = real(resolved) || resolved
  for (const root of [context.worktreeRoot, context.stateRoot]) {
    if (!root || !isInside(root, absolute)) continue
    const rel = path.relative(root, absolute)
    if (!agentRelative(rel)) return true
  }
  return false
}

function recordDirectEdit(payload, context) {
  const tool = String(payload.tool_name || '').toLowerCase()
  if (!EDIT_TOOLS.has(tool) || !toolSucceeded(payload)) return false
  const changed = editPaths(payload).some((file) => projectEditPath(file, payload, context))
  if (!changed) return false
  markWorked(payload, { reason: 'successful direct edit', tool: payload.tool_name })
  return true
}

module.exports = {
  PATHSPEC,
  EDIT_TOOLS,
  statusPaths,
  fingerprint,
  captureBefore,
  finishAfter,
  markWorked,
  didSessionWork,
  clearWork,
  toolSucceeded,
  editPaths,
  recordDirectEdit,
}
