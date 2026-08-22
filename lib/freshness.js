'use strict'
// Is the map still true? Two layers, deliberately separated by cost:
//
//   staleness()  — git only, no LLM, safe to run on every session start.
//   classify()   — decides how much of the map to rebuild once you know what changed.
//
// Keeping them apart is what lets a hook ask "is this stale?" for free, and lets the rebuild
// pay for the expensive answer only when something actually moved.

const path = require('path')
const { git } = require('./paths')
const { readJson, signatures } = require('./graph')

// Our own writes must never make the map look stale, or every refresh dirties the tree and
// asks to refresh again.
const PATHSPEC = ['--', '.', ':(exclude).agent', ':(exclude).agent/**']

function readMeta(file) {
  try {
    return readJson(file)
  } catch {
    return null // a corrupt meta is a missing meta: the map just rebuilds
  }
}

function headSha(root) {
  return git(['rev-parse', 'HEAD'], root)
}

// 'fresh' | 'stale' | 'unbuilt' | 'unknown'
function staleness(root, metaFile) {
  const meta = readMeta(metaFile)
  if (!meta || !meta.sha) return { state: meta ? 'stale' : 'unbuilt', changed: [], sha: null }

  const head = headSha(root)
  if (!head) return { state: 'unknown', changed: [], sha: meta.sha } // no git: cannot tell
  if (head === meta.sha) {
    // Same commit, but the working tree may still have edits the map has not seen.
    const dirty = git(['status', '--porcelain', ...PATHSPEC], root)
    const changed = dirty ? dirty.split('\n').map((l) => l.slice(3).trim()).filter(Boolean) : []
    return { state: changed.length ? 'stale' : 'fresh', changed, sha: head, dirty: true }
  }

  const diff = git(['diff', '--name-only', meta.sha + '..HEAD', ...PATHSPEC], root)
  const changed = diff ? diff.split('\n').filter(Boolean) : []
  const behind = git(['rev-list', '--count', meta.sha + '..HEAD'], root)
  return { state: changed.length ? 'stale' : 'fresh', changed, sha: head, behind: Number(behind) || 0 }
}

function topLevel(p) {
  const norm = String(p).replace(/\\/g, '/')
  const i = norm.indexOf('/')
  return i === -1 ? '' : norm.slice(0, i)
}

// How much to rebuild. `changed` is the file list; `graph` is the last saved map.
//   SKIP         nothing structural moved
//   PARTIAL      re-analyze just these files
//   ARCHITECTURE re-analyze, then redo layers and the tour
//   FULL         start over
function classify(changed, graph) {
  const files = (changed || []).filter(Boolean)
  if (!files.length) return { action: 'SKIP', reason: 'nothing changed since the map was built' }

  const known = signatures(graph || { nodes: [] })
  const mapped = known.size || 1

  if (files.length > 30) {
    return { action: 'FULL', reason: files.length + ' files changed (over 30)' }
  }
  if (files.length / mapped > 0.5) {
    return {
      action: 'FULL',
      reason: files.length + ' of ' + mapped + ' mapped files changed (over half)',
    }
  }

  const knownDirs = new Set([...known.keys()].map(topLevel))
  const newDirs = [...new Set(files.map(topLevel))].filter((d) => d && !knownDirs.has(d))
  if (newDirs.length) {
    return { action: 'ARCHITECTURE', reason: 'new top-level dir: ' + newDirs.join(', ') }
  }
  if (files.length > 10) {
    return { action: 'ARCHITECTURE', reason: files.length + ' files changed (over 10)' }
  }

  return { action: 'PARTIAL', reason: files.length + ' file(s) changed' }
}

// One line for a human or a hook to read.
function summary(s) {
  if (s.state === 'unbuilt') return 'no map yet — run the godkit-map skill'
  if (s.state === 'unknown') return 'map freshness unknown (no git here)'
  if (s.state === 'fresh') return 'map is current'
  const n = s.changed.length
  const behind = s.behind ? ', ' + s.behind + ' commit' + (s.behind === 1 ? '' : 's') + ' behind' : ''
  return 'map is STALE: ' + n + ' file' + (n === 1 ? '' : 's') + ' changed' + behind
}

module.exports = { PATHSPEC, readMeta, headSha, staleness, classify, summary, topLevel }
