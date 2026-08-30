'use strict'
// `godkit save` is where the project's memory can be destroyed, so these tests are about what
// it refuses to do as much as what it does.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const CLI = path.resolve(__dirname, '..', 'bin', 'godkit.js')

function run(cwd, args) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function project() {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-save-')))
  execFileSync('git', ['init', '-q'], { cwd: d })
  fs.mkdirSync(path.join(d, 'src'), { recursive: true })
  fs.writeFileSync(path.join(d, 'src', 'a.ts'), 'export const a = 1\n')
  fs.writeFileSync(path.join(d, 'src', 'b.ts'), 'export const b = 2\n')
  execFileSync('git', ['add', '-A'], { cwd: d })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init'], { cwd: d })

  run(d, ['init'])
  // Commit the scaffold, as a real user would. Left uncommitted, init's own rule files are
  // untracked changes, and the map correctly reports itself stale against them.
  execFileSync('git', ['add', '-A'], { cwd: d })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'godkit init'], { cwd: d })
  return d
}

function merged(d, graph) {
  const tmp = path.join(d, '.agent', 'tmp')
  fs.mkdirSync(tmp, { recursive: true })
  fs.writeFileSync(path.join(tmp, 'graph-merged.json'), JSON.stringify(graph))
}

const TWO_FILES = {
  project: { name: 'demo', languages: ['TypeScript'], description: 'demo project' },
  nodes: [
    { id: 'file:src/a.ts', type: 'file', name: 'a.ts', filePath: 'src/a.ts', summary: 'the A file' },
    { id: 'file:src/b.ts', type: 'file', name: 'b.ts', filePath: 'src/b.ts', summary: 'the B file' },
  ],
  edges: [{ source: 'file:src/b.ts', target: 'file:src/a.ts', type: 'imports' }],
  layers: [{ id: 'core', name: 'Core', description: 'all of it', nodeIds: ['file:src/a.ts', 'file:src/b.ts'] }],
  tour: [{ order: 1, title: 'Start', description: 'begin at a', nodeIds: ['file:src/a.ts'] }],
}

const graphOf = (d) => JSON.parse(fs.readFileSync(path.join(d, '.agent', 'graph.json'), 'utf8'))

test('save writes the graph, the map and the meta', () => {
  const d = project()
  merged(d, TWO_FILES)
  run(d, ['save'])

  const g = graphOf(d)
  assert.equal(g.nodes.length, 2)
  assert.equal(g.edges.length, 1)

  const map = fs.readFileSync(path.join(d, '.agent', 'MAP.md'), 'utf8')
  assert.match(map, /# Map — demo/)
  assert.match(map, /the A file/, 'the map projects node summaries')

  const meta = JSON.parse(fs.readFileSync(path.join(d, '.agent', 'meta.json'), 'utf8'))
  assert.ok(meta.sha, 'meta records the commit the map was built at')
  assert.equal(meta.nodes, 2)

  fs.rmSync(d, { recursive: true, force: true })
})

test('a partial refresh keeps the nodes it did not re-analyze', () => {
  // The failure this prevents: writing only the fresh nodes wipes every other file, and the
  // next refresh then escalates to a full rebuild forever.
  const d = project()
  merged(d, TWO_FILES)
  run(d, ['save'])

  merged(d, {
    nodes: [{ id: 'file:src/a.ts', type: 'file', name: 'a.ts', filePath: 'src/a.ts', summary: 'REANALYZED' }],
    edges: [],
  })
  run(d, ['save'])

  const g = graphOf(d)
  assert.equal(g.nodes.length, 2, 'src/b.ts survived a refresh that did not mention it')
  assert.equal(g.nodes.find((n) => n.id === 'file:src/a.ts').summary, 'REANALYZED')
  assert.equal(g.nodes.find((n) => n.id === 'file:src/b.ts').summary, 'the B file')
  assert.equal(g.layers.length, 1, 'layers are preserved when the refresh supplies none')
  assert.equal(g.tour.length, 1, 'so is the tour')

  fs.rmSync(d, { recursive: true, force: true })
})

test('--replace discards the old graph, for a genuine full rebuild', () => {
  const d = project()
  merged(d, TWO_FILES)
  run(d, ['save'])

  merged(d, {
    nodes: [{ id: 'file:src/a.ts', type: 'file', name: 'a.ts', filePath: 'src/a.ts', summary: 'only one now' }],
    edges: [],
  })
  run(d, ['save', '--replace'])

  assert.equal(graphOf(d).nodes.length, 1)
  fs.rmSync(d, { recursive: true, force: true })
})

test('save refuses to overwrite a graph it could not parse', () => {
  const d = project()
  merged(d, TWO_FILES)
  run(d, ['save'])

  const file = path.join(d, '.agent', 'graph.json')
  fs.writeFileSync(file, '{ not json')
  merged(d, { nodes: [{ id: 'file:x.ts', type: 'file', name: 'x', filePath: 'x.ts', summary: 'new' }], edges: [] })

  assert.throws(() => run(d, ['save']), /refusing to overwrite/)
  assert.equal(fs.readFileSync(file, 'utf8'), '{ not json', 'the damaged file is left exactly as it was')

  fs.rmSync(d, { recursive: true, force: true })
})

test('save refuses when there is no merged graph to save', () => {
  const d = project()
  assert.throws(() => run(d, ['save']), /no graph at/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('save moves scratch to trash rather than deleting it', () => {
  const d = project()
  merged(d, TWO_FILES)
  run(d, ['save'])

  const agent = path.join(d, '.agent')
  assert.ok(!fs.existsSync(path.join(agent, 'tmp')), 'scratch is cleared')
  assert.ok(
    fs.readdirSync(agent).some((e) => e.startsWith('.trash-')),
    'and is recoverable rather than gone',
  )
  fs.rmSync(d, { recursive: true, force: true })
})

test('saved paths are relative, so nothing about this machine is committed', () => {
  const d = project()
  merged(d, {
    nodes: [
      { id: 'file:src/a.ts', type: 'file', name: 'a.ts', filePath: path.join(d, 'src', 'a.ts'), summary: 'abs' },
    ],
    edges: [],
  })
  run(d, ['save'])

  const raw = fs.readFileSync(path.join(d, '.agent', 'graph.json'), 'utf8')
  assert.equal(graphOf(d).nodes[0].filePath, 'src/a.ts')
  assert.ok(!raw.includes(os.homedir()), 'the home directory must never appear in a committed file')

  fs.rmSync(d, { recursive: true, force: true })
})

test('the map goes stale when the code moves, and fresh again after a save', () => {
  const d = project()
  merged(d, TWO_FILES)
  run(d, ['save'])
  assert.match(run(d, ['doctor']), /map is current/)

  fs.writeFileSync(path.join(d, 'src', 'a.ts'), 'export const a = 99\n')
  execFileSync('git', ['add', '-A'], { cwd: d })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'change'], { cwd: d })

  assert.match(run(d, ['doctor']), /map is STALE/)

  merged(d, { nodes: TWO_FILES.nodes, edges: [] })
  run(d, ['save'])
  assert.match(run(d, ['doctor']), /map is current/)

  fs.rmSync(d, { recursive: true, force: true })
})
