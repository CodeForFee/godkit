'use strict'
// Which files the shared .agent/ state says are hot — touched often, and blamed often.
//
// Nothing here reads source code. The signals are the ones agents already write down every
// session: the files they claimed in `scope:`, the files they listed under `## Did`, and the
// files a `## Bugs` bullet named as a root cause. Those are cross-referenced against the map
// for blast radius.
//
// That is the deterministic half, and it is all this file does. Deciding what to actually
// change needs the code itself, and that is godkit-refactor's job.

const { paths } = require('./paths')
const { readLogSignals } = require('./evolve')
const { loadGraph } = require('./graph')
const { category } = require('./scan')

// A path-shaped token: something with a dot-extension, optionally with directories and `*`.
// Deliberately greedy — every candidate is then checked against the map, which is what
// actually decides whether it is a real file.
const PATHISH = /[A-Za-z0-9_@.\-*/]*[A-Za-z0-9_\-*]\.[A-Za-z0-9]{1,6}/g

// Every file the map knows about. The map is the file universe on purpose: it makes prose that
// merely looks like a path ("node 18.4") impossible to score, and it costs no disk access.
function fileUniverse(graph) {
  const out = new Set()
  for (const node of graph.nodes || []) {
    if (node && node.filePath) out.add(node.filePath)
  }
  return out
}

// Fan-in per file: how many other nodes point at something in it. A file that is wrong is
// expensive in proportion to who depends on it.
function fanIn(graph) {
  const byFile = new Map()
  for (const node of graph.nodes || []) {
    if (node && node.id && node.filePath) byFile.set(node.id, node.filePath)
  }
  const out = new Map()
  for (const edge of graph.edges || []) {
    const target = byFile.get(edge && edge.target)
    const source = byFile.get(edge && edge.source)
    if (!target || target === source) continue
    out.set(target, (out.get(target) || 0) + 1)
  }
  return out
}

// `hooks/lazy-*.js` -> the files it names. A claim written as a glob is still a claim, and
// dropping it would throw away the strongest signal in the log stream.
function expand(token, universe) {
  if (!token.includes('*')) return universe.has(token) ? [token] : []
  const rx = new RegExp(
    '^' + token.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$',
  )
  return [...universe].filter((file) => rx.test(file))
}

// Real files named anywhere in a blob of text, glob claims included.
function filesIn(text, universe) {
  const out = new Set()
  for (const raw of String(text || '').match(PATHISH) || []) {
    // `lib/graph.js:88` and `` `lib/graph.js` `` both appear in real logs.
    const token = raw.replace(/^[^A-Za-z0-9_*/.]+|[^A-Za-z0-9_*]+$/g, '')
    if (!token) continue
    for (const file of expand(token, universe)) out.add(file)
  }
  return out
}

// godkit: counting heuristic, not churn analysis. Blame is weighted double because a file that
// was a root cause is evidence about the code, while a file that was merely touched is often
// evidence about what someone happened to be working on. If this ever needs to be defensible
// rather than indicative, the upgrade is git log --numstat over the same file set, not a
// different weight.
function score(entry) {
  return entry.blamed * 2 + entry.touched
}

// The report. `ok: false` when there is no map to check against — a silent empty table would
// read as "the codebase is clean", which is the one wrong answer.
function report(root) {
  const p = paths(root)
  const graph = loadGraph(p.graph)
  const universe = fileUniverse(graph)

  if (!universe.size) {
    return { ok: false, reason: 'no project map — run the godkit-map skill first', files: [] }
  }

  const fan = fanIn(graph)
  const rows = new Map()
  const bump = (file, key, log) => {
    if (!rows.has(file)) {
      rows.set(file, { file, touched: 0, blamed: 0, fanIn: fan.get(file) || 0, logs: new Set() })
    }
    const row = rows.get(file)
    row[key] += 1
    row.logs.add(log)
  }

  const signals = readLogSignals(root)
  for (const signal of signals) {
    // Claimed and changed are one signal, not two: a file listed under `## Did` was almost
    // always inside the same session's `scope:`, and counting both would just square it.
    const touched = filesIn(signal.scope + '\n' + signal.did.join('\n'), universe)
    for (const file of touched) bump(file, 'touched', signal.session)
    for (const file of filesIn(signal.bugs.join('\n'), universe)) bump(file, 'blamed', signal.session)
  }

  // Code only. A README edited in seven sessions outranks every source file in the repo, and
  // says nothing about the code — there is no refactor at the end of that row.
  const files = [...rows.values()]
    .filter((row) => category(row.file) === 'code')
    .map((row) => ({ ...row, sessions: row.logs.size, score: score(row) }))
    .sort((a, b) => b.score - a.score || b.fanIn - a.fanIn || a.file.localeCompare(b.file))

  return { ok: true, reason: '', files, logs: signals.length }
}

module.exports = { report, filesIn, fileUniverse, fanIn, score }
