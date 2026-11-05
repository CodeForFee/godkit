'use strict'
// The eval harness has to be trustworthy before its numbers mean anything: a task must start from a
// clean repo, a fix must pass, a non-fix must fail, and breaking a rule the task states must fail even
// when the visible work is right. A stand-in agent plays each part.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ev = require('../lib/evalrun')

const DIR = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-evaltest-')))
process.on('exit', () => fs.rmSync(DIR, { recursive: true, force: true }))

// A stand-in agent. mode: good (solves every task), lazy (does nothing), vandal (solves, then also
// edits the secrets file the leave-secrets-alone task forbids touching).
const agent = path.join(DIR, 'agent.js')
fs.writeFileSync(
  agent,
  [
    "const fs = require('fs')",
    "let prompt = ''",
    "process.stdin.on('data', (c) => (prompt += c))",
    "process.stdin.on('end', () => {",
    '  const mode = process.argv[2]',
    "  if (mode === 'lazy') return console.log('done')",
    "  const edit = (f, a, b) => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(a, b))",
    "  if (prompt.includes('sum([1, 2, 3])')) edit('sum.js', 'let i = 1', 'let i = 0')",
    "  if (prompt.includes('slugify')) fs.writeFileSync('util.js', \"module.exports = { slugify: (t) => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }\\n\")",
    "  if (prompt.includes('config.js')) edit('config.js', 'http://localhost:3000', 'https://api.example.com/v2')",
    "  if (mode === 'vandal' && fs.existsSync('.env')) fs.appendFileSync('.env', 'OOPS=1\\n')",
    "  console.log('done')",
    '})',
  ].join('\n'),
)
const table = (mode) => ({ [mode]: { bin: process.execPath, shell: false, build: () => ({ args: [agent, mode], stdin: true }) } })
const run = (mode, extra) => ev.runAll({ hosts: [mode], table: table(mode), timeoutSec: 60, ...extra })

test('the shipped tasks are well-formed and start from a state where the check fails', () => {
  const tasks = ev.loadTasks()
  assert.ok(tasks.length >= 3)
  for (const t of tasks) assert.ok(t.id && t.prompt && t.check && t.files, t.id)
  const { results } = run('lazy')
  assert.equal(results.length, tasks.length)
  assert.ok(results.every((r) => r.pass === false), 'a task the starting repo already passes proves nothing: ' + JSON.stringify(results.filter((r) => r.pass)))
})

test('an agent that does the work passes every task', () => {
  const { results, summary } = run('good')
  assert.deepEqual(results.filter((r) => !r.pass).map((r) => r.id + ': ' + r.note), [])
  assert.equal(summary.good.passed, summary.good.total)
})

test('breaking the rule a task states fails it, even though the visible work is done', () => {
  const { results } = run('vandal')
  const byId = Object.fromEntries(results.map((r) => [r.id, r]))
  assert.equal(byId['leave-secrets-alone'].pass, false)
  assert.match(byId['leave-secrets-alone'].note, /check failed/)
  assert.equal(byId['fix-off-by-one'].pass, true)
})

test('tasks can be picked, repeated, and reported as they finish', () => {
  const seen = []
  const { results, summary } = run('good', { only: ['add-slugify'], runs: 2, onResult: (r) => seen.push(r.id) })
  assert.equal(results.length, 2)
  assert.deepEqual(seen, ['add-slugify', 'add-slugify'])
  assert.equal(summary.good.total, 2)
})

test('a task whose files would escape its folder is refused', () => {
  const dir = path.join(DIR, 'evil')
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ id: 'x', prompt: 'p', check: 'true', files: { '../escape.txt': 'x' } }))
  assert.throws(() => ev.runAll({ dir, hosts: ['good'], table: table('good') }), /escapes/)
})

test('a task missing its check is rejected when loaded', () => {
  const dir = path.join(DIR, 'bad')
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ id: 'x', prompt: 'p', files: {} }))
  assert.throws(() => ev.loadTasks(dir), /"check" is required/)
})
