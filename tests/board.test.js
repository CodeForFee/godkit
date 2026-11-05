'use strict'
// The claims table is the thing two agents race on, so the rules about who may hold what are
// tested directly rather than through a hook.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const board = require('../lib/board')

const HEAD = '# Board\n\n## Now (claims)\n\n| agent | scope (file globs) | task | since (UTC) | status |\n|---|---|---|---|---|\n'
const EMPTY = HEAD + board.PLACEHOLDER + '\n\n## Tasks\n\n| id |\n'
const NOW = Date.parse('2026-11-05T10:00:00Z')

test('the placeholder row is not a claim', () => {
  assert.deepEqual(board.readClaims(EMPTY), [])
})

test('globs: a directory covers its tree, a file covers itself, a star stays inside one folder', () => {
  assert.equal(board.covers('lib/', 'lib/a/b.js'), true)
  assert.equal(board.covers('lib', 'lib/a.js'), true)
  assert.equal(board.covers('lib/*', 'lib/a.js'), true)
  assert.equal(board.covers('lib/*', 'lib/a/b.js'), false)
  assert.equal(board.covers('lib/**', 'lib/a/b.js'), true)
  assert.equal(board.covers('src/**/*.ts', 'src/a/b/c.ts'), true)
  assert.equal(board.covers('README.md', 'README.mdx'), false)
  assert.equal(board.covers('README.md tests/*', 'tests/x.js'), true)
})

test('scopes overlap on their literal prefix, conservatively', () => {
  assert.equal(board.scopesOverlap('lib/', 'lib/guard.js'), true)
  assert.equal(board.scopesOverlap('lib/*', 'lib/board.js'), true)
  assert.equal(board.scopesOverlap('*.ts', 'src/a.js'), true, 'a leading star could be anywhere')
  assert.equal(board.scopesOverlap('docs/', 'lib/'), false)
  assert.equal(board.scopesOverlap('README.md', 'README.mdx'), false)
  assert.equal(board.scopesOverlap('a.js b.js', 'c.js d.js'), false)
  assert.equal(board.scopesOverlap('a.js b.js', 'c.js b.js'), true)
})

test('a claim replaces the placeholder and carries the session tag', () => {
  const r = board.addClaim(EMPTY, { agent: 'claude-opus-5', scope: 'lib/*', task: 'refactor', session: 'AAAA1111-xyz', now: NOW })
  assert.ok(!r.conflict)
  assert.doesNotMatch(r.text, /nothing claimed/)
  const [row] = board.readClaims(r.text)
  assert.equal(row.agent, 'claude-opus-5 (aaaa1111)')
  assert.equal(board.tagOf(row.agent), 'aaaa1111')
  assert.equal(board.baseOf(row.agent), 'claude-opus-5')
  assert.equal(row.status, 'wip')
  assert.match(r.text, /## Tasks/, 'the rest of the board is untouched')
})

test('another agent cannot claim an overlapping scope, but can claim a disjoint one', () => {
  const first = board.addClaim(EMPTY, { agent: 'claude-opus-5', scope: 'lib/*', task: 'a', now: NOW })
  const clash = board.addClaim(first.text, { agent: 'codex-5.6', scope: 'lib/guard.js', task: 'b', now: NOW })
  assert.equal(clash.conflict.agent, 'claude-opus-5')
  assert.equal(clash.text, first.text, 'a refused claim changes nothing')
  const ok = board.addClaim(first.text, { agent: 'codex-5.6', scope: 'docs/', task: 'b', now: NOW })
  assert.equal(board.readClaims(ok.text).length, 2)
})

test('the same agent can widen its own claim; a stale or released claim blocks nobody', () => {
  const a = board.addClaim(EMPTY, { agent: 'claude-opus-5', scope: 'lib/*', task: 'a', now: NOW })
  assert.ok(board.addClaim(a.text, { agent: 'claude-opus-5', scope: 'lib/x.js', task: 'a2', now: NOW }).claim)

  const old = board.addClaim(EMPTY, { agent: 'claude-opus-5', scope: 'lib/*', task: 'a', now: NOW - 30 * 3600 * 1000 })
  assert.ok(board.addClaim(old.text, { agent: 'codex-5.6', scope: 'lib/*', task: 'b', now: NOW }).claim, 'older than a day is stale')

  const released = a.text.replace('| wip |', '| released |')
  assert.ok(board.addClaim(released, { agent: 'codex-5.6', scope: 'lib/*', task: 'b', now: NOW }).claim)
})

test('releasing restores the placeholder when nothing is left', () => {
  const a = board.addClaim(EMPTY, { agent: 'claude-opus-5', scope: 'lib/*', task: 'a', session: 'aaaa1111', now: NOW })
  const r = board.releaseClaim(a.text, { agent: 'claude-opus-5' })
  assert.equal(r.removed, 1)
  assert.deepEqual(board.readClaims(r.text), [])
  assert.match(r.text, /nothing claimed/)
  assert.equal(board.releaseClaim(r.text, { agent: 'claude-opus-5' }).removed, 0)
})

test('input that would break the table is refused', () => {
  const bad = (o) => assert.throws(() => board.addClaim(EMPTY, { agent: 'a', scope: 'x', task: 't', ...o }))
  bad({ scope: 'a | b' })
  bad({ task: 'two\nlines' })
  bad({ agent: 'has space' })
  bad({ agent: '' })
  bad({ session: 'ab' })
})

test('staged files outside every live claim are listed; .agent/ never is', () => {
  const a = board.addClaim(EMPTY, { agent: 'claude-opus-5', scope: 'lib/*', task: 'a', now: Date.now() })
  assert.deepEqual(board.unclaimed(a.text, ['lib/x.js', 'docs/y.md', '.agent/log/z.md']), ['docs/y.md'])
})

test('updateBoard writes through, and refuses to invent a board', () => {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-board-')))
  execFileSync('git', ['init', '-q'], { cwd: d })
  assert.throws(() => board.updateBoard(d, (raw) => ({ text: raw })), /no \.agent\/BOARD\.md/)
  fs.mkdirSync(path.join(d, '.agent'))
  fs.writeFileSync(path.join(d, '.agent', 'BOARD.md'), EMPTY)
  board.updateBoard(d, (raw) => board.addClaim(raw, { agent: 'claude-opus-5', scope: 'lib/*', task: 'a' }))
  assert.match(fs.readFileSync(path.join(d, '.agent', 'BOARD.md'), 'utf8'), /claude-opus-5 \| lib\/\*/)
  fs.rmSync(d, { recursive: true, force: true })
})
