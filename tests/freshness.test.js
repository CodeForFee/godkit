'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

const f = require('../lib/freshness')

function graphOf(n, dir) {
  const nodes = []
  for (let i = 0; i < n; i++) {
    const p = (dir || 'src') + '/f' + i + '.ts'
    nodes.push({ id: 'file:' + p, type: 'file', name: 'f' + i, filePath: p })
  }
  return { nodes }
}

function changed(n, dir) {
  return Array.from({ length: n }, (_, i) => (dir || 'src') + '/f' + i + '.ts')
}

test('nothing changed means nothing to do', () => {
  assert.equal(f.classify([], graphOf(20)).action, 'SKIP')
  assert.equal(f.classify(null, graphOf(20)).action, 'SKIP')
})

test('a few changed files re-analyze only those files', () => {
  assert.equal(f.classify(changed(1), graphOf(20)).action, 'PARTIAL')
  assert.equal(f.classify(changed(10), graphOf(60)).action, 'PARTIAL')
})

test('more than ten changed files also redoes the architecture', () => {
  assert.equal(f.classify(changed(11), graphOf(60)).action, 'ARCHITECTURE')
})

test('a new top-level directory always redoes the architecture', () => {
  // One file is normally PARTIAL; a new top-level dir means the shape of the project moved.
  const r = f.classify(['brandnew/x.ts'], graphOf(60))
  assert.equal(r.action, 'ARCHITECTURE')
  assert.match(r.reason, /new top-level dir/)
})

test('a large absolute change count forces a full rebuild', () => {
  assert.equal(f.classify(changed(31), graphOf(60)).action, 'FULL')
})

test('changing more than half the mapped files forces a full rebuild', () => {
  assert.equal(f.classify(changed(15), graphOf(20)).action, 'FULL')
})

test('blast radius wins over file count', () => {
  // 11 files is the ARCHITECTURE rule, but 11 of 20 is over half, so FULL must take precedence.
  assert.equal(f.classify(changed(11), graphOf(20)).action, 'FULL')
})

test('classify never crashes on an empty or missing graph', () => {
  assert.equal(f.classify(['a.ts'], { nodes: [] }).action, 'FULL')
  assert.doesNotThrow(() => f.classify(['a.ts'], null))
})

test('topLevel splits on the first segment only', () => {
  assert.equal(f.topLevel('src/a/b.ts'), 'src')
  assert.equal(f.topLevel('src\\a\\b.ts'), 'src', 'windows separators are normalized')
  assert.equal(f.topLevel('root.ts'), '', 'a root file has no top-level dir')
})

test('summary reads as a sentence for every state', () => {
  assert.match(f.summary({ state: 'unbuilt', changed: [] }), /no map yet/)
  assert.match(f.summary({ state: 'unknown', changed: [] }), /unknown/)
  assert.match(f.summary({ state: 'fresh', changed: [] }), /current/)
  assert.match(f.summary({ state: 'stale', changed: ['a.ts'], behind: 1 }), /STALE: 1 file changed, 1 commit behind/)
  assert.match(f.summary({ state: 'stale', changed: ['a.ts', 'b.ts'], behind: 3 }), /2 files changed, 3 commits behind/)
})

test('the map ignores its own directory when deciding staleness', () => {
  // Writing the map dirties .agent/, which must never make the map look stale again.
  assert.ok(f.PATHSPEC.includes(':(exclude).agent'))
  assert.ok(f.PATHSPEC.includes(':(exclude).agent/**'))
})
