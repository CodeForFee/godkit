'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const g = require('../lib/graph')

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-'))
}

test('sanitizePath keeps in-project paths relative', () => {
  assert.equal(g.sanitizePath('E:/proj/src/a.ts', 'E:/proj'), 'src/a.ts')
  assert.equal(g.sanitizePath('src/a.ts', 'E:/proj'), 'src/a.ts')
})

test('sanitizePath reduces anything outside the project to a basename', () => {
  // The privacy guarantee: no machine layout or username may reach a committed file.
  assert.equal(g.sanitizePath('E:/other/c.ts', 'E:/proj'), 'c.ts')
  assert.equal(g.sanitizePath('/etc/passwd', '/home/u/p'), 'passwd')
})

test('sanitizePath handles a different drive, where a relative path cannot be expressed', () => {
  const out = g.sanitizePath('C:/Users/someone/secret/b.ts', 'E:/proj')
  assert.equal(out, 'b.ts')
  assert.ok(!out.includes('someone'), 'the username must not survive')
})

test('sanitizePath sanitizes Windows paths even when running on POSIX, and vice versa', () => {
  // A map built on Windows is read on Linux (CI, a teammate, a container). Asking the running
  // platform whether 'E:/proj/x.ts' is absolute answers FALSE there, and the full path would
  // ship. Both conventions must be handled on every platform, so these assertions are the same
  // no matter where the suite runs.
  assert.equal(g.sanitizePath('E:/proj/src/a.ts', 'E:/proj'), 'src/a.ts')
  assert.equal(g.sanitizePath('E:/proj/src/a.ts', 'E:/proj/'), 'src/a.ts')
  assert.equal(g.sanitizePath('C:\\Users\\NEO\\x.ts', 'E:/proj'), 'x.ts')
  assert.equal(g.sanitizePath('/home/u/proj/src/a.ts', '/home/u/proj'), 'src/a.ts')
  assert.equal(g.sanitizePath('/etc/shadow', '/home/u/proj'), 'shadow')

  for (const leaky of ['E:/proj/src/a.ts', 'C:\\Users\\NEO\\x.ts', '/home/other/y.ts']) {
    const out = g.sanitizePath(leaky, '/home/u/proj')
    assert.ok(!out.includes(':'), leaky + ' left a drive letter behind: ' + out)
    assert.ok(!out.startsWith('/'), leaky + ' stayed absolute: ' + out)
  }
})

test('normalize dedupes nodes by id, last one winning', () => {
  const out = g.normalize(
    {
      nodes: [
        { id: 'file:a.ts', type: 'file', name: 'a', summary: 'first' },
        { id: 'file:a.ts', type: 'file', name: 'a', summary: 'second' },
      ],
      edges: [],
    },
    '/p',
  )
  assert.equal(out.nodes.length, 1)
  assert.equal(out.nodes[0].summary, 'second')
})

test('normalize keeps the last duplicate edge and drops dangling edges', () => {
  const out = g.normalize(
    {
      nodes: [
        { id: 'file:a.ts', type: 'file', name: 'a' },
        { id: 'file:b.ts', type: 'file', name: 'b' },
      ],
      edges: [
        { source: 'file:a.ts', target: 'file:b.ts', type: 'imports', weight: 0.1, description: 'first' },
        { source: 'file:a.ts', target: 'file:b.ts', type: 'imports', weight: 0.9, description: 'last' },
        { source: 'file:a.ts', target: 'file:missing.ts', type: 'imports' },
      ],
    },
    '/p',
  )
  assert.equal(out.edges.length, 1)
  assert.equal(out.edges[0].weight, 0.9)
  assert.equal(out.edges[0].description, 'last')
})

test('saveGraph rejects absolute graph IDs before touching the destination', () => {
  const d = tmp()
  const f = path.join(d, 'graph.json')
  const original = 'existing graph bytes\n'
  fs.writeFileSync(f, original)

  const graphs = [
    { nodes: [{ id: 'file:/home/user/a.ts' }] },
    { nodes: [{ id: 'file:C:\\Users\\user\\a.ts' }] },
    { nodes: [{ id: 'file:\\\\server\\share\\a.ts' }] },
    {
      nodes: [{ id: 'file:a.ts' }],
      edges: [{ source: 'file:a.ts', target: 'file:/etc/passwd', type: 'imports' }],
    },
    {
      nodes: [{ id: 'file:a.ts' }],
      layers: [{ id: 'l', name: 'L', nodeIds: ['file:C:/secret/a.ts'] }],
    },
  ]

  for (const graph of graphs) {
    assert.throws(() => g.saveGraph(f, graph, d), /absolute path/)
    assert.equal(fs.readFileSync(f, 'utf8'), original)
  }
  fs.rmSync(d, { recursive: true, force: true })
})

test('normalize strips layer and tour references to nodes that do not exist', () => {
  const out = g.normalize(
    {
      nodes: [{ id: 'file:a.ts', type: 'file', name: 'a' }],
      edges: [],
      layers: [{ id: 'l', name: 'L', nodeIds: ['file:a.ts', 'file:gone.ts'] }],
      tour: [{ order: 1, title: 'T', nodeIds: ['file:gone.ts'] }],
    },
    '/p',
  )
  assert.deepEqual(out.layers[0].nodeIds, ['file:a.ts'])
  assert.deepEqual(out.tour[0].nodeIds, [])
})

test('normalize maps complexity aliases onto the three real values', () => {
  const out = g.normalize(
    {
      nodes: [
        { id: 'a', name: 'a', complexity: 'low' },
        { id: 'b', name: 'b', complexity: 'high' },
        { id: 'c', name: 'c', complexity: undefined },
      ],
      edges: [],
    },
    '/p',
  )
  assert.deepEqual(
    out.nodes.map((n) => n.complexity),
    ['simple', 'complex', 'moderate'],
  )
})

test('loadGraph returns null for absent and genuinely empty files', () => {
  const d = tmp()
  const f = path.join(d, 'graph.json')
  assert.equal(g.loadGraph(f), null)
  fs.writeFileSync(f, '')
  assert.equal(g.loadGraph(f), null)
  fs.rmSync(d, { recursive: true, force: true })
})

test('loadGraph refuses to report a non-empty file as empty', () => {
  // This is the guard that stops one bad parse from silently resetting the project's memory.
  const d = tmp()
  const f = path.join(d, 'graph.json')

  fs.writeFileSync(f, '{ not json')
  assert.throws(() => g.loadGraph(f), /refusing to overwrite/)

  fs.writeFileSync(f, '{"something":"else"}')
  assert.throws(() => g.loadGraph(f), /refusing to overwrite/)

  fs.rmSync(d, { recursive: true, force: true })
})

test('readJson tolerates a byte-order mark', () => {
  const d = tmp()
  const f = path.join(d, 'x.json')
  fs.writeFileSync(f, String.fromCharCode(0xfeff) + '{"nodes":[]}')
  assert.deepEqual(g.readJson(f), { nodes: [] })
  fs.rmSync(d, { recursive: true, force: true })
})

test('saveGraph round-trips through loadGraph', () => {
  const d = tmp()
  const f = path.join(d, 'graph.json')
  const saved = g.saveGraph(
    f,
    {
      project: { name: 'p' },
      nodes: [
        {
          id: 'file:a.ts',
          type: 'file',
          name: 'a',
          filePath: 'a.ts',
          lineRange: [1, 10],
          summary: 's',
          tags: ['t'],
          complexity: 'simple',
        },
      ],
      edges: [],
    },
    d,
  )

  // Compare through JSON on both sides: absent and undefined are the same thing on disk, and
  // the on-disk form is the one every other agent reads.
  const back = g.loadGraph(f)
  assert.deepEqual(back.nodes, JSON.parse(JSON.stringify(saved.nodes)))
  assert.equal(back.nodes[0].filePath, 'a.ts')
  assert.deepEqual(back.nodes[0].lineRange, [1, 10])
  fs.rmSync(d, { recursive: true, force: true })
})

test('atomicWriteFile replaces through a same-directory temp and preserves old bytes on failure', () => {
  const d = tmp()
  const f = path.join(d, 'graph.json')
  fs.writeFileSync(f, 'old')
  g.atomicWriteFile(f, 'new')
  assert.equal(fs.readFileSync(f, 'utf8'), 'new')

  fs.writeFileSync(f, 'old')
  const rename = fs.renameSync
  let temp
  fs.renameSync = (from) => {
    temp = from
    throw new Error('rename failed')
  }
  try {
    assert.throws(() => g.atomicWriteFile(f, 'new'), /rename failed/)
  } finally {
    fs.renameSync = rename
  }

  assert.equal(path.dirname(temp), d)
  assert.equal(fs.readFileSync(f, 'utf8'), 'old')
  assert.deepEqual(fs.readdirSync(d), ['graph.json'])
  fs.rmSync(d, { recursive: true, force: true })
})

test('signatures group node identities by file', () => {
  const sigs = g.signatures({
    nodes: [
      { id: 'function:a.ts:z', type: 'function', name: 'z', filePath: 'a.ts' },
      { id: 'function:a.ts:y', type: 'function', name: 'y', filePath: 'a.ts' },
      { id: 'file:b.ts', type: 'file', name: 'b', filePath: 'b.ts' },
    ],
  })
  assert.deepEqual(sigs.get('a.ts'), ['function:y', 'function:z'], 'sorted, so order never matters')
  assert.equal(sigs.size, 2)
})

test('renderMap produces markdown without throwing on an empty graph', () => {
  const out = g.renderMap(g.emptyGraph('demo'))
  assert.match(out, /^# Map — demo/)
  assert.match(out, /Grep `\.agent\/graph\.json`/, 'the recall instruction is always present')
})
