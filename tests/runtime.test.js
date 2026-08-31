'use strict'
// The hook runtime decides what a session may read and what counts as its own work. These are the
// boundaries: shared state resolves to the main worktree, reads stay inside .agent/ and inside a
// byte budget, and lazy/work state belongs to one session only.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-state-'))
process.env.CLAUDE_CONFIG_DIR = STATE
delete process.env.PLUGIN_DATA
delete process.env.CODEX_HOME
delete process.env.CLAUDE_PLUGIN_DATA
process.on('exit', () => fs.rmSync(STATE, { recursive: true, force: true }))

const paths = require('../lib/paths')
const session = require('../lib/session')
const work = require('../lib/work')
const lazy = require('../lib/lazy')

const trash = []
process.on('exit', () => {
  for (const dir of trash) fs.rmSync(dir, { recursive: true, force: true })
})

function repo() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-rt-')))
  trash.push(dir)
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir })
  fs.mkdirSync(path.join(dir, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'code.js'), 'const a = 1\n')
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

// --- agent context -------------------------------------------------------------------------

test('a linked worktree reads the main worktree .agent/, not its own checkout', () => {
  const main = repo()
  const linked = path.join(main, '..', path.basename(main) + '-wt')
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'side', linked], { cwd: main })
  trash.push(path.resolve(linked))

  const context = paths.findAgentContext(linked)
  assert.ok(paths.samePath(context.stateRoot, main), 'state root is the main worktree')
  assert.ok(!paths.samePath(context.worktreeRoot, main), 'work still happens in the linked tree')
  assert.ok(paths.samePath(context.agentDir, path.join(main, '.agent')))
})

test('outside a repo the context is the directory itself and has no .agent', () => {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-bare-')))
  trash.push(dir)
  const context = paths.findAgentContext(dir)
  assert.equal(context.agentDir, null)
  assert.ok(paths.samePath(context.worktreeRoot, dir))
})

// --- bounded, contained reads --------------------------------------------------------------

test('reads outside .agent/ are refused however the path is written', () => {
  const dir = repo()
  const agentDir = path.join(dir, '.agent')
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'not for the brief\n')

  assert.equal(paths.containedPath(agentDir, path.join(dir, 'secret.txt'), 'file'), null)
  assert.equal(paths.readContained(agentDir, path.join(agentDir, '..', 'secret.txt'), 4096, false), null)
  assert.equal(paths.readContained(agentDir, path.join(agentDir, 'missing.md'), 4096, false), null)
})

test('a symlink below .agent/ is never followed', (t) => {
  const dir = repo()
  const agentDir = path.join(dir, '.agent')
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'not for the brief\n')
  try {
    fs.symlinkSync(path.join(dir, 'secret.txt'), path.join(agentDir, 'leak.md'))
  } catch {
    t.skip('symlink creation needs privileges on this host')
    return
  }
  assert.equal(paths.readContained(agentDir, path.join(agentDir, 'leak.md'), 4096, false), null)
})

test('a read stops at its byte budget and says it was truncated', () => {
  const dir = repo()
  const agentDir = path.join(dir, '.agent')
  const file = path.join(agentDir, 'BOARD.md')
  fs.writeFileSync(file, 'x'.repeat(10000) + '\n')

  const head = paths.readContained(agentDir, file, 512, false)
  assert.equal(head.truncated, true)
  assert.ok(Buffer.byteLength(head.text, 'utf8') <= 512)

  const tail = paths.readContained(agentDir, file, 512, true)
  assert.equal(tail.truncated, true)
  assert.ok(Buffer.byteLength(tail.text, 'utf8') <= 512)
})

test('fitBytes respects the budget without splitting a character', () => {
  const text = '—'.repeat(50) // 3 bytes each
  for (const max of [0, 1, 3, 4, 10, 64]) {
    const out = paths.fitBytes(text, max, false)
    assert.ok(Buffer.byteLength(out, 'utf8') <= max, 'budget ' + max)
    assert.ok(!out.includes('�'), 'no split character at budget ' + max)
  }
  assert.equal(paths.fitBytes('short', 64, false), 'short')
})

test('log entries come back newest first and ignore non-markdown', () => {
  const dir = repo()
  const log = path.join(dir, '.agent', 'log')
  for (const name of ['2026-01-01T0000Z-a.md', '2026-06-01T0000Z-b.md', 'notes.txt']) {
    fs.writeFileSync(path.join(log, name), 'x\n')
  }
  const entries = paths.logEntries(path.join(dir, '.agent')).map((file) => path.basename(file))
  assert.deepEqual(entries, ['2026-06-01T0000Z-b.md', '2026-01-01T0000Z-a.md'])
})

// --- session state -------------------------------------------------------------------------

test('session state is keyed by session and never by a raw host id', () => {
  const file = session.statePath('work', { session_id: '../../escape' }, 'state.json')
  assert.ok(paths.isInside(session.runtimeStateRoot(), file), 'state stays under the owned root')
  assert.ok(!file.includes('escape'), 'the raw id never becomes a path component')

  session.writeState('lazy', { session_id: 'one' }, { mode: 'ultra' }, 'mode.json')
  assert.equal(session.readState('lazy', { session_id: 'two' }, 'mode.json'), null)
  assert.equal(session.readState('lazy', { session_id: 'one' }, 'mode.json').mode, 'ultra')
})

test('state calls refuse a missing session, an unknown namespace, and an unsafe leaf', () => {
  assert.throws(() => session.statePath('work', {}, 'state.json'), /session_id/)
  assert.throws(() => session.statePath('nope', { session_id: 'x' }), /namespace/)
  assert.throws(() => session.statePath('work', { session_id: 'x' }, '../out.json'), /unsafe/)
})

test('clearSession removes every namespace for that session alone', () => {
  const mine = { session_id: 'clear-mine' }
  const theirs = { session_id: 'clear-theirs' }
  lazy.setMode(mine, 'lite')
  work.markWorked(mine, { reason: 'test' })
  lazy.setMode(theirs, 'full')

  session.clearSession(mine)
  assert.equal(lazy.readMode(mine), null)
  assert.equal(work.didSessionWork(mine), false)
  assert.equal(lazy.readMode(theirs), 'full')
})

// --- work evidence -------------------------------------------------------------------------

test('the fingerprint moves for project files and holds still for .agent/', () => {
  const dir = repo()
  const before = work.fingerprint(dir)

  fs.writeFileSync(path.join(dir, '.agent', 'BOARD.md'), '# Board\n')
  assert.equal(work.fingerprint(dir), before, '.agent churn is not product work')

  fs.writeFileSync(path.join(dir, 'code.js'), 'const a = 2\n')
  assert.notEqual(work.fingerprint(dir), before)
})

test('a shell tool marks work only when the tree actually changed', () => {
  const dir = repo()
  const quiet = { session_id: 'shell-quiet', tool_use_id: 't1', tool_name: 'Bash' }
  work.captureBefore(quiet, dir)
  assert.equal(work.finishAfter(quiet, dir), false)
  assert.equal(work.didSessionWork(quiet), false)

  const busy = { session_id: 'shell-busy', tool_use_id: 't2', tool_name: 'Bash' }
  work.captureBefore(busy, dir)
  fs.writeFileSync(path.join(dir, 'code.js'), 'const a = 3\n')
  assert.equal(work.finishAfter(busy, dir), true)
  assert.equal(work.didSessionWork(busy), true)

  work.clearWork(busy)
  assert.equal(work.didSessionWork(busy), false)
})

test('a direct edit counts only when it succeeded and landed outside .agent/', () => {
  const dir = repo()
  const context = paths.findAgentContext(dir)
  const edit = (sid, file, response) =>
    work.recordDirectEdit(
      { session_id: sid, cwd: dir, tool_name: 'Edit', tool_input: { file_path: file }, tool_response: response },
      context,
    )

  assert.equal(edit('edit-ok', path.join(dir, 'code.js')), true)
  assert.equal(edit('edit-agent', path.join(dir, '.agent', 'BOARD.md')), false)
  assert.equal(edit('edit-outside', path.join(os.tmpdir(), 'elsewhere.js')), false)
  assert.equal(edit('edit-failed', path.join(dir, 'code.js'), { isError: true }), false)
  assert.equal(work.didSessionWork({ session_id: 'edit-failed' }), false)
})

test('an apply_patch payload is read for the files it touches', () => {
  const dir = repo()
  const context = paths.findAgentContext(dir)
  const payload = {
    session_id: 'patch-1',
    cwd: dir,
    tool_name: 'apply_patch',
    tool_input: { patch: '*** Begin Patch\n*** Update File: code.js\n@@\n-a\n+b\n*** End Patch\n' },
  }
  assert.equal(work.recordDirectEdit(payload, context), true)
})

// --- lazy mode -----------------------------------------------------------------------------

test('an active lazy mode belongs to one session', () => {
  assert.equal(lazy.setMode({ session_id: 'lazy-a' }, 'ultra'), 'ultra')
  assert.equal(lazy.readMode({ session_id: 'lazy-a' }), 'ultra')
  assert.equal(lazy.readMode({ session_id: 'lazy-b' }), null)

  lazy.clearMode({ session_id: 'lazy-a' })
  assert.equal(lazy.readMode({ session_id: 'lazy-a' }), null)
})

test('lazy refuses a mode it does not know, and off is not an activation', () => {
  assert.throws(() => lazy.setMode({ session_id: 'lazy-c' }, 'turbo'), /invalid lazy mode/)
  assert.throws(() => lazy.setMode({ session_id: 'lazy-c' }, 'off'), /invalid lazy mode/)
  assert.equal(lazy.readMode({ session_id: 'lazy-c' }), null)
})

// The roots come back canonical from real(); a path the host hands us does not have to be. On
// Windows CI that gap was an 8.3 short name (C:\Users\RUNNER~1\...), which resolves to the same
// directory and compares as a different one, so eight tests failed and every edit went
// unrecorded. A junction reproduces the same shape on any platform and needs no elevation.
test('an edit reaching the repo through a link is still this session\'s work', (t) => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-alias-')))
  trash.push(base)
  const dir = path.join(base, 'repo')
  fs.mkdirSync(dir)
  execFileSync('git', ['init', '-q'], { cwd: dir })
  fs.mkdirSync(path.join(dir, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'code.js'), 'const a = 1\n')

  const alias = path.join(base, 'alias')
  try {
    fs.symlinkSync(dir, alias, 'junction')
  } catch {
    return t.skip('links not permitted in this environment')
  }

  const context = paths.findAgentContext(dir)
  const viaAlias = path.join(alias, 'code.js')
  // The raw comparison is the bug: same file, different string, so the guard says "not ours".
  assert.equal(paths.isInside(context.stateRoot, viaAlias), false, 'fixture must be non-canonical')

  assert.equal(
    work.recordDirectEdit(
      { session_id: 'alias-edit', cwd: dir, tool_name: 'Edit', tool_input: { file_path: viaAlias } },
      context,
    ),
    true,
    'an edit through a link is still an edit — canonicalize before comparing',
  )
  assert.equal(work.didSessionWork({ session_id: 'alias-edit' }), true)

  // .agent/ stays excluded no matter which path shape names it.
  assert.equal(
    work.recordDirectEdit(
      { session_id: 'alias-agent', cwd: dir, tool_name: 'Edit', tool_input: { file_path: path.join(alias, '.agent', 'BOARD.md') } },
      context,
    ),
    false,
  )
})
