'use strict'
// Group scanned files into batches small enough for one analysis call.
//
// Files that import each other should be described together — a summary written without the
// caller in view is a guess. Directory locality plus import adjacency gets most of that, and
// costs one pass over the file list.
//
// godkit: greedy locality clustering, not true community detection. Files in one directory that
// import each other land together, which is where most of the signal is. If a project's real
// module structure cuts across directories badly enough to hurt, swap this for a modularity
// algorithm — the batch shape is the only thing that changes.

const path = require('path')

const DEFAULT_BUDGET = 60 * 1024 // bytes of source per batch, ~15k tokens

function adjacency(files) {
  const adj = new Map()
  for (const f of files) adj.set(f.path, new Set())
  for (const f of files) {
    for (const dep of f.imports || []) {
      if (!adj.has(dep)) continue
      adj.get(f.path).add(dep)
      adj.get(dep).add(f.path) // undirected: either direction means "describe these together"
    }
  }
  return adj
}

function batch(scanResult, opts) {
  const options = opts || {}
  const budget = options.budget || DEFAULT_BUDGET
  const files = (scanResult.files || []).filter((f) => f.category !== 'data')
  const adj = adjacency(files)
  const byPath = new Map(files.map((f) => [f.path, f]))

  // Directory first, then name: seeds walk the tree in a stable, human order.
  const order = [...files].sort((a, b) => {
    const da = path.posix.dirname(a.path)
    const db = path.posix.dirname(b.path)
    return da === db ? a.path.localeCompare(b.path) : da.localeCompare(db)
  })

  const placed = new Set()
  const batches = []

  for (const seed of order) {
    if (placed.has(seed.path)) continue

    const current = []
    let size = 0

    // A single file over budget still gets its own batch — dropping it would leave a hole in
    // the map, and a slightly oversized call is the cheaper failure.
    const take = (f) => {
      current.push(f.path)
      placed.add(f.path)
      size += f.bytes || 0
    }
    take(seed)

    // Pull in import-connected files first: they are the ones whose meaning depends on context.
    const queue = [...(adj.get(seed.path) || [])]
    while (queue.length && size < budget) {
      const next = queue.shift()
      if (placed.has(next)) continue
      const f = byPath.get(next)
      if (!f) continue
      if (size + (f.bytes || 0) > budget) continue
      take(f)
      for (const n of adj.get(next) || []) if (!placed.has(n)) queue.push(n)
    }

    // Then fill the remaining budget with directory neighbours, which usually belong together
    // even when nothing imports anything.
    const dir = path.posix.dirname(seed.path)
    for (const f of order) {
      if (size >= budget) break
      if (placed.has(f.path)) continue
      if (path.posix.dirname(f.path) !== dir) continue
      if (size + (f.bytes || 0) > budget) continue
      take(f)
    }

    batches.push({ index: batches.length, files: current, bytes: size })
  }

  return batches
}

module.exports = { batch, adjacency, DEFAULT_BUDGET }
