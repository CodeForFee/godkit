'use strict'
// The project memory: load, merge, sanitize, save, and project to markdown.
//
// Two rules here are load-bearing, because breaking either silently destroys the memory
// rather than failing:
//   1. LOAD-PATCH-SAVE, never OVERWRITE. Writing only what you just computed discards every
//      other file's entry; the next run then sees them all as new and escalates to a full
//      rebuild, forever. loadGraph() refuses to report "empty" for a file that has bytes.
//   2. Sanitize paths on save. Absolute paths leak the machine layout and the user's name into
//      a file that gets committed and pushed.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const VERSION = '1.0.0'

// Conventional edge weights. Containment is certain; an unlisted relation is a guess at 0.5.
const EDGE_WEIGHT = {
  contains: 1.0,
  inherits: 0.9,
  implements: 0.9,
  calls: 0.8,
  exports: 0.8,
  imports: 0.7,
  depends_on: 0.6,
  configures: 0.6,
  triggers: 0.6,
  tested_by: 0.6,
}

function emptyGraph(name) {
  return {
    version: VERSION,
    project: {
      name: name || 'unknown',
      languages: [],
      frameworks: [],
      description: '',
      generatedAt: null,
      sha: null,
    },
    nodes: [],
    edges: [],
    layers: [],
    tour: [],
  }
}

function readJson(file) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return null // genuinely absent
  }
  // Editors on Windows leave a BOM; JSON.parse chokes on it. Compare the code point rather
  // than embedding U+FEFF in this file, where it would be invisible to a reader and to grep.
  const text = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()
  if (!text) return null
  return JSON.parse(text) // a corrupt file must throw, never read as empty
}

// Never returns a hollow graph for a file that exists with content: that is the failure that
// turns one bad parse into a permanently reset memory.
function loadGraph(file) {
  let bytes = 0
  try {
    bytes = fs.statSync(file).size
  } catch {
    return null
  }

  let data = null
  try {
    data = readJson(file)
  } catch (err) {
    throw new Error(file + ' is present but unparseable (' + err.message + ') — refusing to overwrite it.')
  }
  if (data && Array.isArray(data.nodes)) return data

  if (bytes > 0) {
    throw new Error(
      file + ' exists (' + bytes + ' bytes) but did not load as a graph — refusing to overwrite it. ' +
        'Fix or delete the file by hand.',
    )
  }
  return null
}

// Absolute paths under the project become relative; anything outside is reduced to its basename
// so no machine layout is committed.
// Deliberately platform-independent: work in path.posix on separator-normalized strings, and
// recognize a Windows drive letter by pattern rather than asking the running platform.
//
// The graph is committed and shared. A map built on Windows gets read on Linux (CI, a
// teammate, a container), where path.isAbsolute('E:/proj/x.ts') is FALSE — so a
// platform-dependent check would pass the full Windows path straight through, leaking the
// machine layout exactly when the file travels.
const WIN_DRIVE = /^[a-zA-Z]:\//
const ABSOLUTE_ID = /(?:^|:)(?:[a-zA-Z]:[\\/]|\/|\\\\)/

function sanitizePath(p, root) {
  if (!p) return p
  const norm = String(p).replace(/\\/g, '/')
  if (!path.posix.isAbsolute(norm) && !WIN_DRIVE.test(norm)) return norm

  const base = String(root || '').replace(/\\/g, '/')
  const rel = path.posix.relative(base, norm)
  // Anything outside the project — a different drive, a parent, another root — comes back
  // starting with '..' or still absolute. Those keep only their basename.
  if (rel && !rel.startsWith('..') && !path.posix.isAbsolute(rel) && !WIN_DRIVE.test(rel)) return rel
  return path.posix.basename(norm)
}

function normalizeComplexity(c) {
  const v = String(c || '').toLowerCase()
  if (v === 'low' || v === 'simple' || v === 'trivial') return 'simple'
  if (v === 'high' || v === 'complex') return 'complex'
  return 'moderate'
}

function assertPortableIds(graph) {
  const ids = []
  for (const n of graph.nodes || []) if (n && n.id) ids.push(n.id)
  for (const e of graph.edges || []) {
    if (e && e.source) ids.push(e.source)
    if (e && e.target) ids.push(e.target)
  }
  for (const l of graph.layers || []) ids.push(...(l.nodeIds || []))
  for (const t of graph.tour || []) ids.push(...(t.nodeIds || []))
  if (ids.some((id) => ABSOLUTE_ID.test(String(id)))) {
    throw new Error('graph id contains an absolute path — refusing to write it')
  }
}

// Merge, dedupe and drop danglers. Node ids are `type:path[:name]` and are the identity:
// two nodes with the same id are the same node, last one wins.
function normalize(graph, root) {
  assertPortableIds(graph)
  const byId = new Map()
  for (const n of graph.nodes || []) {
    if (!n || !n.id) continue
    byId.set(n.id, {
      id: n.id,
      type: n.type || 'file',
      name: n.name || n.id,
      filePath: sanitizePath(n.filePath, root),
      lineRange: Array.isArray(n.lineRange) ? n.lineRange : undefined,
      summary: n.summary || '',
      tags: Array.isArray(n.tags) ? n.tags : [],
      complexity: normalizeComplexity(n.complexity),
    })
  }

  const byEdge = new Map()
  for (const e of graph.edges || []) {
    if (!e || !e.source || !e.target || !e.type) continue
    if (!byId.has(e.source) || !byId.has(e.target)) continue // dangling: an endpoint never existed
    const key = JSON.stringify([e.source, e.target, e.type])
    byEdge.set(key, {
      source: e.source,
      target: e.target,
      type: e.type,
      weight: typeof e.weight === 'number' ? e.weight : EDGE_WEIGHT[e.type] || 0.5,
      description: e.description || undefined,
    })
  }

  const ids = new Set(byId.keys())
  const layers = (graph.layers || []).map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description || '',
    nodeIds: (l.nodeIds || []).filter((id) => ids.has(id)),
  }))
  const tour = (graph.tour || []).map((t, i) => ({
    order: typeof t.order === 'number' ? t.order : i + 1,
    title: t.title || '',
    description: t.description || '',
    nodeIds: (t.nodeIds || []).filter((id) => ids.has(id)),
  }))

  return {
    version: VERSION,
    project: graph.project || emptyGraph().project,
    nodes: [...byId.values()],
    edges: [...byEdge.values()],
    layers,
    tour,
  }
}

function atomicWriteFile(file, data) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const temp = path.join(
    dir,
    '.' + path.basename(file) + '.' + process.pid + '-' + crypto.randomBytes(6).toString('hex') + '.tmp',
  )
  try {
    fs.writeFileSync(temp, data, { flag: 'wx' })
    fs.renameSync(temp, file)
  } catch (err) {
    try { fs.unlinkSync(temp) } catch {}
    throw err
  }
}

function saveGraph(file, graph, root) {
  const clean = normalize(graph, root)
  atomicWriteFile(file, JSON.stringify(clean, null, 2) + '\n')
  return clean
}

// A file's structural signature is derived from the graph itself, so there is no second store
// that can fall out of sync with it.
function signatures(graph) {
  const out = new Map()
  for (const n of (graph && graph.nodes) || []) {
    if (!n.filePath) continue
    if (!out.has(n.filePath)) out.set(n.filePath, [])
    out.get(n.filePath).push(n.type + ':' + n.name)
  }
  for (const [k, v] of out) out.set(k, v.sort())
  return out
}

function renderMap(graph) {
  const p = graph.project || {}
  const lines = [
    '# Map — ' + (p.name || 'project'),
    '',
    '<!-- Generated by godkit-map from .agent/graph.json. Do not hand-edit: the next refresh',
    '     overwrites it. Correct the graph, or re-run the map. -->',
    '',
    '**Generated:** ' + (p.generatedAt || 'never') +
      ' · **Commit:** ' + (p.sha ? String(p.sha).slice(0, 8) : 'unknown') +
      ' · **Nodes:** ' + ((graph.nodes || []).length),
    '',
  ]

  if (p.description) lines.push(p.description, '')
  const stack = [...(p.languages || []), ...(p.frameworks || [])]
  if (stack.length) lines.push('**Stack:** ' + stack.join(', '), '')

  if ((graph.layers || []).length) {
    lines.push('## Architecture', '')
    for (const l of graph.layers) {
      lines.push('### ' + l.name)
      if (l.description) lines.push('', l.description)
      lines.push('')
      for (const id of l.nodeIds.slice(0, 12)) {
        const n = graph.nodes.find((x) => x.id === id)
        if (n) lines.push('- `' + (n.filePath || n.id) + '` — ' + n.summary)
      }
      if (l.nodeIds.length > 12) lines.push('- …' + (l.nodeIds.length - 12) + ' more')
      lines.push('')
    }
  }

  if ((graph.tour || []).length) {
    lines.push('## Start here', '')
    for (const t of [...graph.tour].sort((a, b) => a.order - b.order)) {
      lines.push(t.order + '. **' + t.title + '** — ' + t.description)
    }
    lines.push('')
  }

  lines.push(
    '## Recall',
    '',
    'Grep `.agent/graph.json`, never load it whole: search `"name"`, `"summary"` and `"tags"`',
    'for the concept, collect the node ids, then grep those ids in `"edges"` for the one-hop',
    'neighbourhood. That answers most questions without reading a single source file.',
    '',
  )
  return lines.join('\n')
}

module.exports = {
  VERSION,
  EDGE_WEIGHT,
  emptyGraph,
  readJson,
  loadGraph,
  sanitizePath,
  normalize,
  atomicWriteFile,
  saveGraph,
  signatures,
  renderMap,
}
