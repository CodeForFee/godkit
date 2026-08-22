'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { scan, category } = require('../lib/scan')
const { batch } = require('../lib/batch')

function fixture() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-scan-'))
  const w = (rel, body) => {
    const f = path.join(d, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, body)
  }
  w('src/a.js', "const b = require('./b')\nmodule.exports = { go: () => b.run() }\n")
  w('src/b.js', 'module.exports = { run: () => 42 }\n')
  w('src/deep/c.js', "import { go } from '../a'\nexport const c = go\n")
  w('README.md', '# hi\n')
  w('package.json', '{}\n')
  w('node_modules/evil/index.js', 'module.exports = 1\n')
  w('dist/bundle.js', 'x\n')
  w('.agent/BOARD.md', '# board\n')
  return d
}

test('category classifies by extension and by well-known filename', () => {
  assert.equal(category('src/a.ts'), 'code')
  assert.equal(category('tsconfig.json'), 'config')
  assert.equal(category('README.md'), 'docs')
  assert.equal(category('Dockerfile'), 'infra')
  assert.equal(category('data.csv'), 'data')
  assert.equal(category('logo.png'), null, 'unknown types are not mapped')
})

test('scan skips the directories that are never worth a token', () => {
  const d = fixture()
  const r = scan(d)
  const paths = r.files.map((f) => f.path)

  assert.ok(!paths.some((p) => p.startsWith('node_modules/')), 'node_modules excluded')
  assert.ok(!paths.some((p) => p.startsWith('dist/')), 'build output excluded')
  assert.ok(!paths.some((p) => p.startsWith('.agent/')), 'our own state excluded')
  assert.ok(paths.includes('src/a.js'))

  fs.rmSync(d, { recursive: true, force: true })
})

test('scan resolves relative imports to real files in the project', () => {
  const d = fixture()
  const r = scan(d)
  const a = r.files.find((f) => f.path === 'src/a.js')
  const c = r.files.find((f) => f.path === 'src/deep/c.js')

  assert.deepEqual(a.imports, ['src/b.js'], "require('./b') resolves to the real file")
  assert.deepEqual(c.imports, ['src/a.js'], "import from '../a' resolves across directories")

  fs.rmSync(d, { recursive: true, force: true })
})

test('scan leaves bare package specifiers out of the import graph', () => {
  const d = fixture()
  fs.writeFileSync(path.join(d, 'src', 'x.js'), "const fs = require('fs')\nconst z = require('lodash')\n")
  const r = scan(d)
  const x = r.files.find((f) => f.path === 'src/x.js')
  assert.deepEqual(x.imports, [], 'packages say nothing about internal structure')
  fs.rmSync(d, { recursive: true, force: true })
})

test('scan honours .agentignore', () => {
  const d = fixture()
  fs.writeFileSync(path.join(d, '.agent', '.agentignore'), 'src/deep/\n')
  const r = scan(d)
  assert.ok(!r.files.some((f) => f.path.startsWith('src/deep/')), 'ignored directory is skipped')
  assert.ok(r.files.some((f) => f.path === 'src/a.js'), 'siblings are still scanned')
  fs.rmSync(d, { recursive: true, force: true })
})

test('batch places every file exactly once', () => {
  const d = fixture()
  const r = scan(d)
  const b = batch(r)

  const placed = b.flatMap((x) => x.files)
  const expected = r.files.filter((f) => f.category !== 'data').length
  assert.equal(placed.length, expected, 'no file dropped, none duplicated')
  assert.equal(new Set(placed).size, expected)

  fs.rmSync(d, { recursive: true, force: true })
})

test('batch keeps files that import each other together', () => {
  const d = fixture()
  const b = batch(scan(d))
  const withA = b.find((x) => x.files.includes('src/a.js'))
  assert.ok(withA.files.includes('src/b.js'), 'an import edge pulls b in beside a')
  fs.rmSync(d, { recursive: true, force: true })
})

test('an impossible budget still places every file rather than dropping one', () => {
  const d = fixture()
  const r = scan(d)
  const b = batch(r, { budget: 1 })
  const placed = b.flatMap((x) => x.files)
  const expected = r.files.filter((f) => f.category !== 'data').length
  assert.equal(placed.length, expected, 'an oversized batch beats a hole in the map')
  fs.rmSync(d, { recursive: true, force: true })
})
