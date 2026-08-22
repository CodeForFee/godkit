'use strict'
// Locating things. Every other module asks this one where the project and its .agent/ live.
// Nothing here throws: a caller with no git, no .agent/ and no repo still gets usable answers.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const AGENT_DIR = '.agent'

function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null // no git binary, not a repo, or a detached/broken state — all mean "no answer"
  }
}

// The MAIN repo root, even when called from a linked worktree.
// A worktree is ephemeral; writing .agent/ into one would throw the memory away when it is pruned.
function gitRoot(cwd) {
  const top = git(['rev-parse', '--show-toplevel'], cwd)
  if (!top) return null

  // Resolve both from `top` so a relative --git-common-dir ('.git') resolves against the
  // worktree root rather than against whatever subdirectory the caller happened to be in.
  const gitDir = git(['rev-parse', '--absolute-git-dir'], top)
  const commonRaw = git(['rev-parse', '--git-common-dir'], top)
  if (!gitDir || !commonRaw) return top

  const common = path.resolve(top, commonRaw)
  // In a linked worktree the git dir is <common>/worktrees/<name>, so the two differ.
  if (path.resolve(gitDir) !== common) return path.dirname(common)
  return top
}

// Nearest .agent/ at or above start, so a hook fired from a subdirectory still finds it.
function findAgentDir(start) {
  let dir = path.resolve(start || process.cwd())
  for (;;) {
    const candidate = path.join(dir, AGENT_DIR)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

// Where .agent/ belongs, whether or not it exists yet: an existing one wins, then the repo root,
// then the caller's cwd.
function projectRoot(start) {
  const cwd = path.resolve(start || process.cwd())
  const found = findAgentDir(cwd)
  if (found) return path.dirname(found)
  return gitRoot(cwd) || cwd
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

// 2026-08-22T1403Z — sortable first, so a lexical sort of log filenames is chronological.
function utcStamp(date) {
  const iso = (date || new Date()).toISOString()
  return iso.slice(0, 13).replace(/:/g, '') + iso.slice(14, 16) + 'Z'
}

function logName(agent, sessionId) {
  const sid = String(sessionId || '').slice(0, 8)
  const who = String(agent || 'agent').replace(/[^a-z0-9-]/gi, '-')
  return utcStamp() + '-' + who + (sid ? '-' + sid : '') + '.md'
}

// Newest first. Filenames are UTC-prefixed, so lexical order is chronological.
function logEntries(agentDir) {
  const dir = path.join(agentDir, 'log')
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse()
      .map((f) => path.join(dir, f))
  } catch {
    return []
  }
}

module.exports = {
  AGENT_DIR,
  git,
  gitRoot,
  findAgentDir,
  projectRoot,
  paths,
  utcStamp,
  logName,
  logEntries,
}
