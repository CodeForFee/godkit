'use strict'
// Locating shared project state. Hooks execute in the active worktree, while .agent/ belongs to
// the main worktree so it survives linked-worktree removal and remains common to every agent.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const AGENT_DIR = '.agent'
const MAX_DIRECTORY_ENTRIES = 4096

function git(args, cwd, encoding) {
  try {
    const out = execFileSync('git', args, {
      cwd,
      encoding: encoding === undefined ? 'utf8' : encoding,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
    return typeof out === 'string' ? out.trim() : out
  } catch {
    return null // no git binary, not a repo, or a detached/broken state means "no answer"
  }
}

// The ONLY canonicalizer in this package. `.native` is not a detail: plain fs.realpathSync leaves
// an 8.3 short name (`C:\Users\RUNNER~1\...`) exactly as it found it, while git and `.native` both
// report the long form. Mixing the two yields paths that name the same directory and compare as
// different, so isInside/samePath quietly answer false and a hook records nothing at all.
// Anything that compares paths must come through here.
function real(file) {
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(file) : fs.realpathSync(file)
  } catch {
    return null
  }
}

function pathKey(file) {
  const resolved = path.resolve(file)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function samePath(a, b) {
  return Boolean(a && b && pathKey(a) === pathKey(b))
}

function isInside(root, file) {
  const rel = path.relative(path.resolve(root), path.resolve(file))
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep))
}

function worktreeRoot(cwd) {
  const top = git(['rev-parse', '--show-toplevel'], cwd)
  return top ? real(top) || path.resolve(top) : null
}

// The MAIN worktree root, even when called from a linked worktree.
function gitRoot(cwd) {
  const top = worktreeRoot(cwd)
  if (!top) return null

  const gitDir = git(['rev-parse', '--absolute-git-dir'], top)
  const commonRaw = git(['rev-parse', '--git-common-dir'], top)
  if (!gitDir || !commonRaw) return top

  const common = real(path.resolve(top, commonRaw)) || path.resolve(top, commonRaw)
  if (!samePath(real(gitDir) || gitDir, common)) return real(path.dirname(common)) || path.dirname(common)
  return top
}

// Only a real .agent directory at the main worktree's exact child path is authoritative. A
// linked worktree may contain its own checkout or an exact link to this directory; neither can
// redirect state elsewhere, and an out-of-repo symlink is never followed.
function canonicalAgentDir(stateRoot) {
  const rootReal = real(stateRoot)
  if (!rootReal) return null
  const candidate = path.join(rootReal, AGENT_DIR)
  let stat
  try {
    stat = fs.lstatSync(candidate)
  } catch {
    return null
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return null
  const candidateReal = real(candidate)
  return samePath(candidateReal, path.join(rootReal, AGENT_DIR)) ? candidateReal : null
}

function findAgentContext(start) {
  const cwd = path.resolve(typeof start === 'string' && start ? start : process.cwd())
  const worktree = worktreeRoot(cwd) || cwd
  const state = gitRoot(cwd) || worktree
  const agentDir = canonicalAgentDir(state)

  // A local .agent in a linked worktree is deliberately ignored unless it resolves exactly to
  // the main copy. Returning the canonical main path in either case prevents callers from ever
  // reading the worktree-local checkout by accident.
  if (agentDir && !samePath(worktree, state)) {
    const local = path.join(worktree, AGENT_DIR)
    try {
      const stat = fs.lstatSync(local)
      if (stat.isSymbolicLink() && samePath(real(local), agentDir)) {
        return { worktreeRoot: worktree, stateRoot: state, agentDir }
      }
    } catch {
      /* no local .agent is normal */
    }
  }

  return { worktreeRoot: worktree, stateRoot: state, agentDir }
}

function findAgentDir(start) {
  return findAgentContext(start).agentDir
}

function projectRoot(start) {
  return findAgentContext(start).stateRoot
}

function paths(root) {
  const dir = path.join(projectRoot(root), AGENT_DIR)
  return {
    dir,
    board: path.join(dir, 'BOARD.md'),
    thread: path.join(dir, 'THREAD.md'),
    map: path.join(dir, 'MAP.md'),
    graph: path.join(dir, 'graph.json'),
    meta: path.join(dir, 'meta.json'),
    ignore: path.join(dir, '.agentignore'),
    tasks: path.join(dir, 'tasks'),
    log: path.join(dir, 'log'),
    tmp: path.join(dir, 'tmp'),
    skills: path.join(dir, 'skills'),
    skillsDoc: path.join(dir, 'SKILLS.md'),
  }
}

// Validates every component with lstat before returning a path. This intentionally rejects all
// symlinks below .agent/: project-controlled links must not turn a session brief into a local-file
// reader. The root itself is canonical and must also be a real directory.
function containedPath(root, file, kind) {
  const rootAbs = path.resolve(root)
  const fileAbs = path.resolve(file)
  if (!isInside(rootAbs, fileAbs)) return null

  let rootStat
  try {
    rootStat = fs.lstatSync(rootAbs)
  } catch {
    return null
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return null

  const rel = path.relative(rootAbs, fileAbs)
  let current = rootAbs
  for (const part of rel ? rel.split(path.sep) : []) {
    current = path.join(current, part)
    let stat
    try {
      stat = fs.lstatSync(current)
    } catch {
      return null
    }
    if (stat.isSymbolicLink()) return null
  }

  const targetReal = real(fileAbs)
  const rootReal = real(rootAbs)
  if (!targetReal || !rootReal || !isInside(rootReal, targetReal)) return null

  let finalStat
  try {
    finalStat = fs.lstatSync(fileAbs)
  } catch {
    return null
  }
  if (kind === 'file' && !finalStat.isFile()) return null
  if (kind === 'directory' && !finalStat.isDirectory()) return null
  return fileAbs
}

function decodeEdge(buffer, fromEnd) {
  let text = buffer.toString('utf8')
  if (fromEnd) text = text.replace(/^\uFFFD+/, '')
  else text = text.replace(/\uFFFD+$/, '')
  return text
}

function fitBytes(value, maxBytes, fromEnd) {
  const text = String(value || '')
  const max = Math.max(0, Number(maxBytes) || 0)
  const body = Buffer.from(text, 'utf8')
  if (body.length <= max) return text
  const mark = Buffer.from('…', 'utf8')
  if (max <= mark.length) return ''
  const room = max - mark.length
  if (fromEnd) return '…' + decodeEdge(body.subarray(body.length - room), true)
  return decodeEdge(body.subarray(0, room), false) + '…'
}

function readContained(root, file, maxBytes, fromEnd) {
  const safe = containedPath(root, file, 'file')
  if (!safe) return null

  const max = Math.max(0, Number(maxBytes) || 0)
  let fd
  try {
    const noFollow = fs.constants.O_NOFOLLOW || 0
    fd = fs.openSync(safe, fs.constants.O_RDONLY | noFollow)
    const stat = fs.fstatSync(fd)
    if (!stat.isFile()) return null
    const take = Math.min(stat.size, max + 1)
    const buffer = Buffer.alloc(take)
    const offset = fromEnd ? Math.max(0, stat.size - take) : 0
    let read = 0
    while (read < take) {
      const n = fs.readSync(fd, buffer, read, take - read, offset + read)
      if (!n) break
      read += n
    }
    let text = decodeEdge(buffer.subarray(0, Math.min(read, max)), Boolean(fromEnd))
    if (fromEnd && offset > 0) {
      const newline = text.indexOf('\n')
      if (newline !== -1) text = text.slice(newline + 1)
    }
    return { text, truncated: stat.size > max }
  } catch {
    return null
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd)
      } catch {
        /* best effort */
      }
    }
  }
}

function containedEntries(root, dir, maxEntries) {
  const safe = containedPath(root, dir, 'directory')
  if (!safe) return []
  const max = Math.max(0, Number(maxEntries) || MAX_DIRECTORY_ENTRIES)
  const out = []
  let handle
  try {
    handle = fs.opendirSync(safe)
    while (out.length < max) {
      const entry = handle.readSync()
      if (!entry) break
      const abs = containedPath(root, path.join(safe, entry.name))
      if (!abs) continue
      let stat
      try {
        stat = fs.lstatSync(abs)
      } catch {
        continue
      }
      out.push({ name: entry.name, path: abs, isFile: stat.isFile(), isDirectory: stat.isDirectory() })
    }
  } catch {
    return []
  } finally {
    if (handle) {
      try {
        handle.closeSync()
      } catch {
        /* best effort */
      }
    }
  }
  return out
}

// 2026-08-22T1403Z — sortable first, so a lexical sort of log filenames is chronological.
function utcStamp(date) {
  const iso = (date || new Date()).toISOString()
  return iso.slice(0, 13).replace(/:/g, '') + iso.slice(14, 16) + 'Z'
}

function sessionSlug(sessionId) {
  return String(sessionId || '').slice(0, 8).replace(/[^a-z0-9_-]/gi, '-')
}

function logName(agent, sessionId) {
  const sid = sessionSlug(sessionId)
  const who = String(agent || 'agent').replace(/[^a-z0-9-]/gi, '-')
  return utcStamp() + '-' + who + (sid ? '-' + sid : '') + '.md'
}

// Newest first. The bounded directory walk ignores links and keeps hook latency predictable.
function logEntries(agentDir) {
  return containedEntries(agentDir, path.join(agentDir, 'log'), MAX_DIRECTORY_ENTRIES)
    .filter((entry) => entry.isFile && entry.name.endsWith('.md'))
    .map((entry) => entry.path)
    .sort()
    .reverse()
}

module.exports = {
  AGENT_DIR,
  git,
  real,
  worktreeRoot,
  gitRoot,
  findAgentContext,
  findAgentDir,
  projectRoot,
  paths,
  samePath,
  isInside,
  containedPath,
  readContained,
  containedEntries,
  fitBytes,
  utcStamp,
  sessionSlug,
  logName,
  logEntries,
}
