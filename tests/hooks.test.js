'use strict'
// Hooks run on every session and their output is invisible when it goes wrong, so what matters
// is that they never throw, never block a read-only session, and never loop.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')

function runHook(script, payload) {
  return execFileSync(process.execPath, [path.join(ROOT, 'hooks', script)], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-hook-'))
  // realpath: macOS hands back /var, which git then reports as /private/var.
  const real = fs.realpathSync(d)
  execFileSync('git', ['init', '-q'], { cwd: real })
  return real
}

test('brief tells you to set up when there is no .agent/', () => {
  const d = repo()
  const out = runHook('brief.js', { cwd: d })
  assert.match(out, /No \.agent\/ directory/)
  assert.match(out, /godkit init/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('brief injects the board when .agent/ exists', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(d, '.agent', 'BOARD.md'), '# Board — demo\n\n## Bugs\n- [ ] B-001 thing\n')

  const out = runHook('brief.js', { cwd: d })
  assert.match(out, /Handoff \(\.agent\/\)/)
  assert.match(out, /B-001 thing/)
  assert.match(out, /Claim your scope/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('brief includes the newest log entries, newest first', () => {
  const d = repo()
  const log = path.join(d, '.agent', 'log')
  fs.mkdirSync(log, { recursive: true })
  fs.writeFileSync(path.join(d, '.agent', 'BOARD.md'), '# Board\n')
  fs.writeFileSync(path.join(log, '2026-01-01T0000Z-old.md'), 'OLDEST ENTRY\n')
  fs.writeFileSync(path.join(log, '2026-06-01T0000Z-mid.md'), 'MIDDLE ENTRY\n')
  fs.writeFileSync(path.join(log, '2026-08-01T0000Z-new.md'), 'NEWEST ENTRY\n')

  const out = runHook('brief.js', { cwd: d })
  assert.match(out, /NEWEST ENTRY/)
  assert.match(out, /MIDDLE ENTRY/)
  assert.ok(!out.includes('OLDEST ENTRY'), 'only the newest two are injected')
  fs.rmSync(d, { recursive: true, force: true })
})

test('every hook survives malformed and empty stdin', () => {
  for (const script of ['brief.js', 'clockout.js', 'map-watch.js']) {
    assert.doesNotThrow(() => runHook(script, 'this is not json'), script + ' threw on bad input')
    assert.doesNotThrow(() => runHook(script, ''), script + ' threw on empty input')
  }
})

test('clockout stays silent when there is no .agent/', () => {
  const d = repo()
  assert.equal(runHook('clockout.js', { cwd: d, session_id: 'abcd1234' }).trim(), '')
  fs.rmSync(d, { recursive: true, force: true })
})

test('clockout stays silent for a session that changed nothing', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  assert.equal(runHook('clockout.js', { cwd: d, session_id: 'abcd1234' }).trim(), '')
  fs.rmSync(d, { recursive: true, force: true })
})

test('clockout blocks when files changed and no log was written', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')

  const out = runHook('clockout.js', { cwd: d, session_id: 'abcd1234' })
  const decision = JSON.parse(out)
  assert.equal(decision.decision, 'block')
  assert.match(decision.reason, /Clock out first/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('clockout accepts a log entry carrying this session id', () => {
  const d = repo()
  const log = path.join(d, '.agent', 'log')
  fs.mkdirSync(log, { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')
  fs.writeFileSync(path.join(log, '2026-08-22T1200Z-claude-abcd1234.md'), 'logged\n')

  assert.equal(runHook('clockout.js', { cwd: d, session_id: 'abcd1234' }).trim(), '')
  fs.rmSync(d, { recursive: true, force: true })
})

test('clockout never blocks twice in one turn', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')

  const out = runHook('clockout.js', { cwd: d, session_id: 'abcd1234', stop_hook_active: true })
  assert.equal(out.trim(), '', 'stop_hook_active must short-circuit, or the turn loops forever')
  fs.rmSync(d, { recursive: true, force: true })
})

test('changes confined to .agent/ do not count as work needing a log', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(d, '.agent', 'BOARD.md'), '# Board\n')

  assert.equal(runHook('clockout.js', { cwd: d, session_id: 'abcd1234' }).trim(), '')
  fs.rmSync(d, { recursive: true, force: true })
})

test('map-watch ignores commands that do not land a change', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent'), { recursive: true })
  for (const command of ['ls -la', 'npm test', 'git status', 'git log --oneline']) {
    assert.equal(runHook('map-watch.js', { cwd: d, tool_input: { command } }).trim(), '', command)
  }
  fs.rmSync(d, { recursive: true, force: true })
})

test('map-watch speaks up after a commit when no map has been built', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent'), { recursive: true })

  const out = runHook('map-watch.js', { cwd: d, tool_input: { command: 'git commit -m wip' } })
  const parsed = JSON.parse(out)
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolUse')
  assert.match(parsed.hookSpecificOutput.additionalContext, /godkit-map/)
  fs.rmSync(d, { recursive: true, force: true })
})
