'use strict'
// The hotspot ranking. Two things matter and the rest is arithmetic: a file blamed as a root
// cause must outrank a file that was merely touched the same number of times, and prose that
// merely looks like a path must never score at all — the map is the file universe, so a token
// no map node claims is not a file.

const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const hotspots = require('../lib/hotspots')
const PROJECTS = new Set()

afterEach(() => {
  for (const dir of PROJECTS) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  PROJECTS.clear()
})

// A project carrying only what hotspots reads: a graph naming the files, and log entries.
function project(files, logs) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-hot-')))
  PROJECTS.add(d)
  const agent = path.join(d, '.agent')
  fs.mkdirSync(path.join(agent, 'log'), { recursive: true })

  fs.writeFileSync(
    path.join(agent, 'graph.json'),
    JSON.stringify({
      version: 1,
      nodes: files.map((f) => ({ id: 'file:' + f, type: 'file', name: f, filePath: f })),
      edges: [],
    }),
  )

  logs.forEach((body, i) => {
    const stamp = '2026-08-2' + i + 'T1200Z'
    fs.writeFileSync(path.join(agent, 'log', stamp + '-claude-s' + i + '.md'), body)
  })
  return d
}

function entry(scope, did, bugs) {
  return [
    '---',
    'agent: "claude"',
    'session: "s-' + scope.replace(/\W/g, '') + '"',
    'scope: ' + scope,
    'status: "done"',
    '---',
    '',
    '## Did',
    '',
    ...did.map((l) => '- ' + l),
    '',
    '## Bugs',
    '',
    ...bugs.map((l) => '- ' + l),
    '',
  ].join('\n')
}

test('a file blamed as a root cause outranks one that was only touched', () => {
  const d = project(
    ['src/a.js', 'src/b.js'],
    [
      entry('src/a.js, src/b.js', ['changed both — src/a.js:12', 'and src/b.js:40'], []),
      entry('src/a.js', ['fixed it — src/a.js:12'], ['fixed B-001 — leak. Root cause src/a.js:12.']),
    ],
  )

  const rep = hotspots.report(d)
  assert.equal(rep.ok, true, rep.reason)
  assert.equal(rep.files[0].file, 'src/a.js', 'blame must outweigh a bare touch')
  assert.equal(rep.files[0].blamed, 1)
  assert.equal(rep.files[0].touched, 2)
  assert.equal(rep.files[0].score, 4) // 1 blamed x2 + 2 touched
  assert.equal(rep.files[1].file, 'src/b.js')
  assert.equal(rep.files[1].score, 1)
})

test('a glob claim counts for every file it names', () => {
  // Dropping globs would throw away the strongest signal in the log stream: `scope:` is where
  // agents record what they actually held.
  const d = project(
    ['hooks/one.js', 'hooks/two.js', 'lib/other.js'],
    [entry('hooks/*.js', [], [])],
  )

  const rep = hotspots.report(d)
  const byFile = new Map(rep.files.map((f) => [f.file, f]))
  assert.equal(byFile.get('hooks/one.js').touched, 1)
  assert.equal(byFile.get('hooks/two.js').touched, 1)
  assert.equal(byFile.has('lib/other.js'), false, 'a glob must not reach outside its directory')
})

test('path-shaped prose that names no real file scores nothing', () => {
  const d = project(['src/a.js'], [entry('src/a.js', ['needs node 18.4 and v2.1 of the parser'], [])])

  const rep = hotspots.report(d)
  assert.equal(rep.files.length, 1)
  assert.equal(rep.files[0].file, 'src/a.js')
})

test('docs are ranked out — there is no refactor at the end of a README row', () => {
  const d = project(
    ['README.md', 'src/a.js'],
    [entry('README.md, src/a.js', [], []), entry('README.md', [], []), entry('README.md', [], [])],
  )

  const rep = hotspots.report(d)
  assert.deepEqual(rep.files.map((f) => f.file), ['src/a.js'])
})

test('no map is reported, not silently rendered as a clean codebase', () => {
  const d = project([], [entry('src/a.js', [], [])])
  const rep = hotspots.report(d)
  assert.equal(rep.ok, false)
  assert.match(rep.reason, /no project map/)
})

test('fan-in counts the files that depend on this one, not its own internals', () => {
  const graphFiles = ['lib/core.js', 'lib/one.js', 'lib/two.js']
  const d = project(graphFiles, [entry('lib/core.js', [], [])])

  const graph = path.join(d, '.agent', 'graph.json')
  const g = JSON.parse(fs.readFileSync(graph, 'utf8'))
  g.edges = [
    { source: 'file:lib/one.js', target: 'file:lib/core.js', type: 'imports' },
    { source: 'file:lib/two.js', target: 'file:lib/core.js', type: 'imports' },
    { source: 'file:lib/core.js', target: 'file:lib/core.js', type: 'imports' }, // self, ignored
  ]
  fs.writeFileSync(graph, JSON.stringify(g))

  const rep = hotspots.report(d)
  assert.equal(rep.files[0].file, 'lib/core.js')
  assert.equal(rep.files[0].fanIn, 2)
})
