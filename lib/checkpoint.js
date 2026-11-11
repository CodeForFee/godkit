'use strict'
// File checkpoints for hosts that have none, and a second line for hosts that do (Claude Code's own
// /rewind does not cover files only a shell command changed, or most subagent edits).
//
// A checkpoint is a git commit of the whole working tree, built with a throwaway copy of the index so
// the real index, the branch and the working tree are never touched, stored under
// refs/godkit/checkpoints/<session>/<n>. Nothing is pushed, nothing shows in `git log`, and
// `git gc` drops what the pruning below has unreferenced.
//
// godkit: a rewind restores the files the snapshot knew about. A file created after the snapshot is
// listed and left alone (deleting what an agent made is a decision, not a restore), and a gitignored
// file is not part of a checkpoint at all. Chunked per-file deltas are the upgrade if a repo is large
// enough that `git add -A` per checkpoint hurts; the debounce keeps it to one per 15s meanwhile.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const NS = 'refs/godkit/checkpoints'
const KEEP = 50
const AUTHOR = { GIT_AUTHOR_NAME: 'godkit', GIT_AUTHOR_EMAIL: 'godkit@localhost', GIT_COMMITTER_NAME: 'godkit', GIT_COMMITTER_EMAIL: 'godkit@localhost' }

function git(cwd, args, env, input) {
  return execFileSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    env: Object.assign({}, process.env, env || {}),
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }).replace(/\r?\n$/, '')
}

const tryGit = (cwd, args, env) => {
  try {
    return git(cwd, args, env)
  } catch {
    return null
  }
}

const slugOf = (key) => String(key || 'session').slice(0, 8).replace(/[^A-Za-z0-9_-]/g, '-') || 'session'

// Newest last. [{ ref, slug, n, at, subject }]
function list(root, slug) {
  const out = tryGit(root, ['for-each-ref', '--format=%(refname)%09%(creatordate:unix)%09%(subject)', NS + (slug ? '/' + slug : '')])
  if (!out) return []
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [ref, at, subject] = line.split('\t')
      const parts = ref.slice(NS.length + 1).split('/')
      return { ref, slug: parts.slice(0, -1).join('/'), n: Number(parts[parts.length - 1]) || 0, at: Number(at) * 1000, subject: subject || '' }
    })
    .sort((a, b) => a.at - b.at || a.n - b.n)
}

// Snapshot the working tree for this session. Returns { ref } or { skipped: why }.
function snapshot(root, key, opts) {
  const o = opts || {}
  const top = tryGit(root, ['rev-parse', '--show-toplevel'])
  if (!top) return { skipped: 'not a git repository' }
  const slug = slugOf(key)
  const indexFile = path.resolve(top, git(top, ['rev-parse', '--git-path', 'index']))
  const temp = path.join(path.dirname(indexFile), 'godkit-checkpoint-index-' + process.pid)
  try {
    const env = { GIT_INDEX_FILE: temp }
    // Preserve tracked/staged paths, but rebuild the temporary index without cached stat data
    // or assume-unchanged flags: a safety snapshot must read the present working-tree bytes.
    if (fs.existsSync(indexFile)) {
      fs.copyFileSync(indexFile, temp)
      const indexedTree = git(top, ['write-tree'], env)
      fs.unlinkSync(temp)
      git(top, ['read-tree', indexedTree], env)
    }
    git(top, ['add', '-A', '--', '.', ':(exclude).agent'], env)
    const tree = git(top, ['write-tree'], env)

    const mine = list(top, slug)
    const last = mine[mine.length - 1]
    if (last && tryGit(top, ['rev-parse', last.ref + '^{tree}']) === tree && !o.force) return { skipped: 'unchanged' }

    const parent = last ? last.ref : tryGit(top, ['rev-parse', '--verify', '-q', 'HEAD'])
    const n = (last ? last.n : 0) + 1
    const commit = git(top, ['commit-tree', tree].concat(parent ? ['-p', parent] : [], ['-m', o.message || 'checkpoint ' + slug + ' #' + n]), AUTHOR)
    const ref = NS + '/' + slug + '/' + String(n).padStart(4, '0')
    git(top, ['update-ref', ref, commit])

    const all = list(top, slug)
    for (const old of all.slice(0, Math.max(0, all.length - (o.keep || KEEP)))) tryGit(top, ['update-ref', '-d', old.ref])
    return { ref, commit, n }
  } finally {
    try {
      fs.rmSync(temp, { force: true })
    } catch {
      /* best effort */
    }
  }
}

// Resolve "slug/n", "slug" (its newest) or "last" (newest of all) to an entry from list().
function resolve(root, spec) {
  const all = list(root)
  if (!all.length) return null
  if (!spec || spec === 'last') return all[all.length - 1]
  const [slug, n] = String(spec).split('/')
  const mine = all.filter((e) => e.slug === slug)
  return (n ? mine.find((e) => e.n === Number(n)) : mine[mine.length - 1]) || null
}

// What a rewind to this checkpoint would do to the working tree.
function plan(root, entry) {
  const top = git(root, ['rev-parse', '--show-toplevel'])
  const restore = []
  const addedSince = new Set()
  for (const line of git(top, ['diff', '--name-status', '--no-renames', entry.ref, '--']).split('\n').filter(Boolean)) {
    const [status, ...rest] = line.split('\t')
    const file = rest.join('\t')
    if (status === 'A') addedSince.add(file)
    else restore.push(file)
  }
  const inSnapshot = new Set(git(top, ['ls-tree', '-r', '--name-only', entry.ref]).split('\n').filter(Boolean))
  for (const file of git(top, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) {
    if (!inSnapshot.has(file) && !file.startsWith('.agent/')) addedSince.add(file)
  }
  return { top, restore: restore.filter((f) => !f.startsWith('.agent/')), created: [...addedSince].sort() }
}

// Put the files back. A safety checkpoint of the present state is taken first, so a rewind can be undone.
function rewind(root, entry) {
  const p = plan(root, entry)
  const safety = snapshot(p.top, 'rewind-' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14), { force: true, message: 'before rewind to ' + entry.ref })
  if (p.restore.length) git(p.top, ['restore', '--source=' + entry.ref, '--worktree', '--pathspec-from-file=-', '--pathspec-file-nul'], null, p.restore.join('\0') + '\0')
  return { restored: p.restore, created: p.created, safety: safety.ref || null }
}

module.exports = { NS, KEEP, list, snapshot, resolve, plan, rewind }
