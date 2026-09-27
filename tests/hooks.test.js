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
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-hook-state-'))
process.on('exit', () => fs.rmSync(STATE, { recursive: true, force: true }))

function runHook(script, payload, argv) {
  return execFileSync(process.execPath, [path.join(ROOT, 'hooks', script), ...(argv || [])], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    // Session state must never land in the real home directory during a test run.
    env: { ...process.env, CLAUDE_CONFIG_DIR: STATE, PLUGIN_DATA: '', CODEX_HOME: '' },
  })
}

// Work is session-owned evidence now: a dirty tree alone proves nothing about THIS session.
function recordWork(dir, sid, file) {
  runHook(
    'work-track.js',
    { cwd: dir, session_id: sid, tool_name: 'Edit', tool_input: { file_path: path.join(dir, file) } },
    ['edit'],
  )
}

function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-hook-'))
  // realpath: macOS hands back /var, which git then reports as /private/var.
  const real = fs.realpathSync.native(d)
  execFileSync('git', ['init', '-q'], { cwd: real })
  return real
}

test('brief only hints, and writes nothing, in a repo with code that never opted in', () => {
  const d = repo()
  fs.writeFileSync(path.join(d, 'app.js'), 'module.exports = 1\n')
  const out = runHook('brief.js', { cwd: d })
  assert.match(out, /No \.agent\/ here/)
  assert.match(out, /bin\/godkit\.js" init/, 'the hint names a CLI that works without godkit on PATH')
  assert.equal(fs.existsSync(path.join(d, '.agent')), false)
  fs.rmSync(d, { recursive: true, force: true })
})

test('brief scaffolds .agent/ in an opted-in clone that lacks it, then briefs from it', () => {
  const d = repo()
  fs.writeFileSync(path.join(d, 'app.js'), 'module.exports = 1\n')
  fs.writeFileSync(path.join(d, 'CLAUDE.md'), '<!-- godkit:start -->\nrules\n<!-- godkit:end -->\n')
  const out = runHook('brief.js', { cwd: d })
  assert.ok(fs.existsSync(path.join(d, '.agent', 'BOARD.md')), 'scaffolded')
  assert.equal(fs.existsSync(path.join(d, '.agent', 'BRIEF.md')), false, 'code exists: not greenfield')
  assert.match(out, /Handoff \(\.agent\/\)/)
  assert.match(out, /No map yet — run the godkit-map skill/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('brief turns an empty folder into a greenfield project and says to fill the brief', () => {
  const d = repo()
  const out = runHook('brief.js', { cwd: d })
  assert.ok(fs.existsSync(path.join(d, '.agent', 'BRIEF.md')))
  assert.match(out, /NEW PROJECT\. FIRST STEP, even for a one-turn build: fill \.agent\/BRIEF\.md/)
  assert.ok(out.indexOf('NEW PROJECT') < out.indexOf('BOARD'), 'the project state leads the brief')
  assert.match(out, /Do not ask the user to fill it/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('the brief stays within its constant budget however large the board grows', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  const bugs = Array.from({ length: 400 }, (_, i) => '- [x] B-' + i + ' fixed ' + 'x'.repeat(80))
  fs.writeFileSync(path.join(d, '.agent', 'BOARD.md'), '# Board\n\n## Bugs\n' + bugs.join('\n') + '\n- [ ] B-999 open one\n')
  const out = runHook('brief.js', { cwd: d })
  assert.ok(Buffer.byteLength(out) <= 3 * 1024 + 1, 'brief is ' + Buffer.byteLength(out) + ' bytes')
  assert.match(out, /B-999 open one/, 'open work survives the digest')
  assert.doesNotMatch(out, /B-1 fixed/, 'fixed work does not')
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
  const entry = (task) =>
    '---\nagent: "claude-opus-5"\nstatus: "done"\nscope: "src/x.js"\n---\n\n## Task\n\n' + task + '\n\n## Did\n\nBODY DETAIL\n'
  for (let m = 1; m <= 7; m++) {
    fs.writeFileSync(path.join(log, '2026-0' + m + '-01T0000Z-a.md'), entry('TASK ' + m))
  }

  const out = runHook('brief.js', { cwd: d })
  assert.match(out, /2026-07-01T0000Z claude-opus-5 · done · src\/x\.js — TASK 7/)
  assert.ok(out.indexOf('TASK 7') < out.indexOf('TASK 3'), 'newest first')
  assert.ok(!out.includes('TASK 2'), 'only the newest five are listed')
  assert.ok(!out.includes('BODY DETAIL'), 'one line per log, never the body')
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

test('clockout blocks when this session worked and no log was written', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')
  recordWork(d, 'block001', 'code.js')

  const out = runHook('clockout.js', { cwd: d, session_id: 'block001' })
  const decision = JSON.parse(out)
  assert.equal(decision.decision, 'block')
  assert.match(decision.reason, /Clock out first/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('a dirty tree this session did not touch is not evidence against it', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'someone else changed this\n')
  recordWork(d, 'other001', 'code.js')

  assert.equal(runHook('clockout.js', { cwd: d, session_id: 'clean001' }).trim(), '')
  fs.rmSync(d, { recursive: true, force: true })
})

test('clockout accepts a log entry carrying this session id', () => {
  const d = repo()
  const log = path.join(d, '.agent', 'log')
  fs.mkdirSync(log, { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')
  recordWork(d, 'abcd1234', 'code.js')
  fs.writeFileSync(path.join(log, '2026-08-22T1200Z-claude-abcd1234.md'), 'logged\n')

  assert.equal(runHook('clockout.js', { cwd: d, session_id: 'abcd1234' }).trim(), '')
  fs.rmSync(d, { recursive: true, force: true })
})

test('a log naming a different session does not clock this one out', () => {
  const d = repo()
  const log = path.join(d, '.agent', 'log')
  fs.mkdirSync(log, { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')
  recordWork(d, 'mine0001', 'code.js')
  fs.writeFileSync(path.join(log, '2026-08-22T1200Z-claude-theirs01.md'), 'logged\n')

  const decision = JSON.parse(runHook('clockout.js', { cwd: d, session_id: 'mine0001' }))
  assert.equal(decision.decision, 'block')
  fs.rmSync(d, { recursive: true, force: true })
})

test('clockout never blocks twice in one turn', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')

  recordWork(d, 'loop0001', 'code.js')
  const out = runHook('clockout.js', { cwd: d, session_id: 'loop0001', stop_hook_active: true })
  assert.equal(out.trim(), '', 'stop_hook_active must short-circuit, or the turn loops forever')
  fs.rmSync(d, { recursive: true, force: true })
})

test('changes confined to .agent/ do not count as work needing a log', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(d, '.agent', 'BOARD.md'), '# Board\n')
  recordWork(d, 'agent001', path.join('.agent', 'BOARD.md'))

  assert.equal(runHook('clockout.js', { cwd: d, session_id: 'agent001' }).trim(), '')
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

// A log file existing is not the same as the work being proven. This is the one contract rule the
// Stop hook enforces; everything else godkit verify reports stays advisory.
test('clockout blocks a log that claims done with nothing under Verified', () => {
  const d = repo()
  const log = path.join(d, '.agent', 'log')
  fs.mkdirSync(log, { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')
  recordWork(d, 'unpr0001', 'code.js')
  fs.writeFileSync(
    path.join(log, '2026-08-31T1200Z-claude-unpr0001.md'),
    ['---', 'session: "unpr0001"', 'status: "done"', '---', '', '## Verified', '', '<!-- x -->', ''].join('\n'),
  )

  const decision = JSON.parse(runHook('clockout.js', { cwd: d, session_id: 'unpr0001' }))
  assert.equal(decision.decision, 'block')
  assert.match(decision.reason, /## Verified is empty/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('clockout accepts the same log once it carries a command and its output', () => {
  const d = repo()
  const log = path.join(d, '.agent', 'log')
  fs.mkdirSync(log, { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')
  recordWork(d, 'prov0001', 'code.js')
  fs.writeFileSync(
    path.join(log, '2026-08-31T1200Z-claude-prov0001.md'),
    ['---', 'session: "prov0001"', 'status: "done"', '---', '', '## Verified', '- `npm test` -> 12 passing', ''].join('\n'),
  )

  assert.equal(runHook('clockout.js', { cwd: d, session_id: 'prov0001' }).trim(), '')
  fs.rmSync(d, { recursive: true, force: true })
})

test('an unproven log still cannot block twice in one turn', () => {
  const d = repo()
  const log = path.join(d, '.agent', 'log')
  fs.mkdirSync(log, { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')
  recordWork(d, 'loop0002', 'code.js')
  fs.writeFileSync(
    path.join(log, '2026-08-31T1200Z-claude-loop0002.md'),
    ['---', 'session: "loop0002"', 'status: "done"', '---', '', '## Verified', ''].join('\n'),
  )

  const out = runHook('clockout.js', { cwd: d, session_id: 'loop0002', stop_hook_active: true })
  assert.equal(out.trim(), '', 'stop_hook_active must short-circuit the evidence check too')
  fs.rmSync(d, { recursive: true, force: true })
})

test('a partial log with no handoff is reported by verify but does not block the Stop hook', () => {
  const d = repo()
  const log = path.join(d, '.agent', 'log')
  fs.mkdirSync(log, { recursive: true })
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')
  recordWork(d, 'part0001', 'code.js')
  const file = path.join(log, '2026-08-31T1200Z-claude-part0001.md')
  fs.writeFileSync(
    file,
    ['---', 'agent: "claude-opus-5"', 'session: "part0001"', 'status: "partial"', '---', '', '## Left / next', '', '<!-- -->', ''].join('\n'),
  )

  assert.equal(runHook('clockout.js', { cwd: d, session_id: 'part0001' }).trim(), '')
  const findings = require('../lib/contract').checkLog(path.join(d, '.agent'), file)
  assert.deepEqual(findings.map((f) => f.tag), ['resume-blocked'])
  fs.rmSync(d, { recursive: true, force: true })
})

test('a verified clock-out archives finished board items, silently', () => {
  const d = repo()
  const log = path.join(d, '.agent', 'log')
  fs.mkdirSync(log, { recursive: true })
  const bugs = Array.from({ length: 12 }, (_, i) => '- [x] B-' + String(i + 1).padStart(3, '0') + ' fixed')
  fs.writeFileSync(path.join(d, '.agent', 'BOARD.md'), '# Board\n\n## Bugs\n\n' + bugs.join('\n') + '\n\n## Decisions\n\n- keep me\n')
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')
  recordWork(d, 'feed1234', 'code.js')
  fs.writeFileSync(path.join(log, '2026-08-22T1200Z-claude-opus-5-feed1234.md'), 'logged\n')

  assert.equal(runHook('clockout.js', { cwd: d, session_id: 'feed1234' }).trim(), '', 'no output on success')
  const board = fs.readFileSync(path.join(d, '.agent', 'BOARD.md'), 'utf8')
  assert.doesNotMatch(board, /B-001 fixed/)
  assert.match(board, /B-012 fixed/)
  assert.match(board, /keep me/, 'decisions are never archived')
  assert.ok(fs.readdirSync(path.join(d, '.agent', 'archive')).length, 'moved into .agent/archive/')
  fs.rmSync(d, { recursive: true, force: true })
})

test('lazy-activate injects one line at the default level, not the whole skill', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'lazy-activate.js')], {
    input: JSON.stringify({ session_id: 'lazy-line' }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: STATE, PLUGIN_DATA: '', CODEX_HOME: '', GODKIT_LAZY_MODE: 'full' },
  })
  assert.match(out, /GODKIT-LAZY MODE ACTIVE — level: full/)
  assert.ok(Buffer.byteLength(out) < 200, 'lazy injection is ' + Buffer.byteLength(out) + ' bytes')
})
