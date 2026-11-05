'use strict'
// Cursor and Antigravity speak their own hook dialects. These run hooks/adapt.js with the field
// names the hosts' docs give, and check three things: our scripts still do their job through it,
// the answer has the keys the host reads, and registering never disturbs a hook that is not ours.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const ADAPT = path.join(ROOT, 'hooks', 'adapt.js')
const install = require('../lib/install')
const { MAX_STOP_BLOCKS } = require('../hooks/adapt')

const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-adapt-state-'))
process.on('exit', () => fs.rmSync(STATE, { recursive: true, force: true }))

function adapt(host, event, input) {
  const out = execFileSync(process.execPath, [ADAPT, host, event], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CLAUDE_CONFIG_DIR: STATE, PLUGIN_DATA: '', CODEX_HOME: '' },
  })
  return JSON.parse(out)
}

function repo() {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-adapt-')))
  execFileSync('git', ['init', '-q'], { cwd: d })
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(d, '.agent', 'BOARD.md'), '# Board\n\n## Bugs\n- [ ] B-042 adapter marker\n')
  fs.writeFileSync(path.join(d, 'code.js'), 'changed\n')
  return d
}

// --- Cursor ---------------------------------------------------------------------------------

test('cursor sessionStart puts the board in additional_context', () => {
  const d = repo()
  const out = adapt('cursor', 'sessionStart', { conversation_id: 'cur-start-1', workspace_roots: [d], hook_event_name: 'sessionStart' })
  assert.match(out.additional_context, /B-042 adapter marker/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('cursor: a Write is work, and stop asks for the log through followup_message', () => {
  const d = repo()
  const base = { conversation_id: 'cur-work-1', workspace_roots: [d] }
  adapt('cursor', 'postToolUse', { ...base, tool_name: 'Write', tool_use_id: 't1', tool_input: { path: path.join(d, 'code.js') } })

  const blocked = adapt('cursor', 'stop', { ...base, status: 'completed', loop_count: 0 })
  assert.match(blocked.followup_message, /Clock out first/)
  assert.equal(blocked.decision, undefined, 'Cursor reads followup_message, not a Claude decision')

  fs.writeFileSync(path.join(d, '.agent', 'log', '2026-11-05T1200Z-m-cur-work.md'), 'logged\n')
  assert.deepEqual(adapt('cursor', 'stop', { ...base, status: 'completed', loop_count: 1 }), {})
  fs.rmSync(d, { recursive: true, force: true })
})

test('cursor: a stop the host did not finish normally is left alone', () => {
  const d = repo()
  const base = { conversation_id: 'cur-abort-1', workspace_roots: [d] }
  adapt('cursor', 'postToolUse', { ...base, tool_name: 'Write', tool_use_id: 't1', tool_input: { path: path.join(d, 'code.js') } })
  assert.deepEqual(adapt('cursor', 'stop', { ...base, status: 'aborted', loop_count: 0 }), {})
  fs.rmSync(d, { recursive: true, force: true })
})

test('cursor: a read-only session is never asked for a log', () => {
  const d = repo()
  const base = { conversation_id: 'cur-read-1', workspace_roots: [d] }
  adapt('cursor', 'postToolUse', { ...base, tool_name: 'Read', tool_use_id: 't1', tool_input: { path: path.join(d, 'code.js') } })
  assert.deepEqual(adapt('cursor', 'stop', { ...base, status: 'completed', loop_count: 0 }), {})
  fs.rmSync(d, { recursive: true, force: true })
})

test('the log request is made at most MAX_STOP_BLOCKS times, so a host without its own cap cannot loop', () => {
  const d = repo()
  const base = { conversation_id: 'cur-loop-1', workspace_roots: [d] }
  adapt('cursor', 'postToolUse', { ...base, tool_name: 'Write', tool_use_id: 't1', tool_input: { path: path.join(d, 'code.js') } })
  for (let i = 0; i < MAX_STOP_BLOCKS; i++) {
    assert.ok(adapt('cursor', 'stop', { ...base, status: 'completed', loop_count: i }).followup_message, 'ask #' + (i + 1))
  }
  assert.deepEqual(adapt('cursor', 'stop', { ...base, status: 'completed', loop_count: MAX_STOP_BLOCKS }), {})
  fs.rmSync(d, { recursive: true, force: true })
})

test('cursor: events outside the registered set answer {} instead of failing', () => {
  assert.deepEqual(adapt('cursor', 'preToolUse', { conversation_id: 'x' }), {})
  assert.deepEqual(adapt('cursor', 'sessionEnd', { conversation_id: 'cur-end-1' }), {})
})

// --- Antigravity ----------------------------------------------------------------------------

test('antigravity SessionStart injects the board as a system message step', () => {
  const d = repo()
  const out = adapt('antigravity', 'SessionStart', { conversationId: 'agy-start-1', workspacePaths: [d] })
  assert.match(out.injectSteps[0].systemMessage.systemMessage, /B-042 adapter marker/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('antigravity: write_to_file is work, and Stop continues the loop until the log exists', () => {
  const d = repo()
  const base = { conversationId: 'agy-work-1', workspacePaths: [d] }
  adapt('antigravity', 'PostToolUse', { ...base, stepIdx: 3, toolCall: { name: 'write_to_file', args: { TargetFile: path.join(d, 'code.js') } }, error: '' })

  const blocked = adapt('antigravity', 'Stop', { ...base, terminationReason: 'model_stop', fullyIdle: true, executionNum: 1 })
  assert.equal(blocked.decision, 'continue')
  assert.match(blocked.reason, /Clock out first/)

  fs.writeFileSync(path.join(d, '.agent', 'log', '2026-11-05T1200Z-m-agy-work.md'), 'logged\n')
  assert.deepEqual(adapt('antigravity', 'Stop', { ...base, terminationReason: 'model_stop', fullyIdle: true, executionNum: 2 }), { decision: 'stop' })
  fs.rmSync(d, { recursive: true, force: true })
})

test('antigravity: a failed edit is not work, and a run_command is not an edit', () => {
  const d = repo()
  const base = { conversationId: 'agy-fail-1', workspacePaths: [d] }
  adapt('antigravity', 'PostToolUse', { ...base, stepIdx: 1, toolCall: { name: 'write_to_file', args: { TargetFile: path.join(d, 'code.js') } }, error: 'disk full' })
  adapt('antigravity', 'PostToolUse', { ...base, stepIdx: 2, toolCall: { name: 'run_command', args: { CommandLine: 'ls', Cwd: d } }, error: '' })
  assert.deepEqual(adapt('antigravity', 'Stop', { ...base, terminationReason: 'model_stop', fullyIdle: true }), { decision: 'stop' })
  fs.rmSync(d, { recursive: true, force: true })
})

test('antigravity: a stop that ended in an error is not second-guessed', () => {
  const d = repo()
  const base = { conversationId: 'agy-err-1', workspacePaths: [d] }
  adapt('antigravity', 'PostToolUse', { ...base, stepIdx: 1, toolCall: { name: 'write_to_file', args: { TargetFile: path.join(d, 'code.js') } }, error: '' })
  assert.deepEqual(adapt('antigravity', 'Stop', { ...base, terminationReason: 'error', fullyIdle: true }), { decision: 'stop' })
  fs.rmSync(d, { recursive: true, force: true })
})

// --- registration ---------------------------------------------------------------------------

const ours = { kind: 'cursor', hooksDir: path.join(ROOT, 'hooks') }

test('every registered host event has at least one script behind it', () => {
  for (const [host, events] of Object.entries(install.ADAPTED)) {
    for (const [hostEvent, event] of events) {
      assert.ok(install.adaptedRows(event, host).length, host + ' ' + hostEvent + ' maps to ' + event + ' but no HOOKS row runs for it')
    }
  }
  const pair = (host, event) => install.adaptedRows(event, host).filter((row) => row[1] === 'work-track.js' && (row[3][0] === 'pre' || row[3][0] === 'post'))
  assert.equal(pair('cursor', 'PostToolUse').length + pair('cursor', 'PreToolUse').length, 0, 'Cursor has no PreToolUse on every tool, so no before-snapshot')
  assert.equal(pair('antigravity', 'PreToolUse').length, 1, 'Antigravity can take the before-snapshot')
  assert.equal(pair('antigravity', 'PostToolUse').length, 1)
})

test('cursor registration keeps a hook that is not ours, is idempotent, and uninstalls only itself', () => {
  const theirs = { version: 1, hooks: { stop: [{ command: 'their-stop.sh' }], beforeSubmitPrompt: [{ command: 'their-prompt.sh' }] } }
  const once = install.applyHooks(theirs, ours)
  const twice = install.applyHooks(once.settings, ours)
  assert.equal(once.added, install.ADAPTED.cursor.length)
  assert.equal(install.ourHandlers(twice.settings, 'cursor').length, install.ADAPTED.cursor.length, 're-running replaces, never appends')
  assert.equal(twice.removed, install.ADAPTED.cursor.length)
  assert.equal(twice.settings.hooks.stop.length, 2, 'their stop hook survives next to ours')
  assert.equal(twice.settings.hooks.stop.find((h) => h.command === 'their-stop.sh').command, 'their-stop.sh')
  assert.equal(twice.settings.hooks.stop.find((h) => h.loop_limit).loop_limit, 3, 'Cursor is told how often to re-submit')

  const gone = install.applyHooks(twice.settings, { ...ours, uninstall: true })
  assert.deepEqual(gone.settings, theirs)
  assert.equal(JSON.stringify(theirs).includes('adapt.js'), false, 'the input object is never mutated')
})

test('cursor registration into an empty file sets the version Cursor requires', () => {
  assert.equal(install.applyHooks({}, ours).settings.version, 1)
})

test('antigravity registration lives under one key, keeps the others, and removes only itself', () => {
  const theirs = { 'their-hook': { enabled: true, SessionStart: [{ type: 'command', command: 'their.sh' }] } }
  const dir = { kind: 'antigravity', hooksDir: path.join(ROOT, 'hooks') }
  const once = install.applyHooks(theirs, dir)
  assert.equal(install.ourHandlers(once.settings, 'antigravity').length, install.ADAPTED.antigravity.length)
  assert.deepEqual(once.settings['their-hook'], theirs['their-hook'])
  assert.equal(once.settings.godkit.PostToolUse[0].matcher, '*', 'tool events carry the matcher Antigravity requires')
  assert.equal(once.settings.godkit.PreToolUse[0].matcher, '*')

  const again = install.applyHooks(once.settings, dir)
  assert.equal(again.removed, install.ADAPTED.antigravity.length)
  assert.deepEqual(install.applyHooks(again.settings, { ...dir, uninstall: true }).settings, theirs)
})

test('antigravity registration refuses to overwrite a hook named godkit that is not ours', () => {
  const foreign = { godkit: { enabled: true, Stop: [{ type: 'command', command: 'someone-elses.sh' }] } }
  const result = install.applyHooks(foreign, { kind: 'antigravity', hooksDir: path.join(ROOT, 'hooks') })
  assert.match(result.skipped, /not ours/)
  assert.deepEqual(result.settings, foreign)
})

test('a host directory that is not there is not created by an installer run', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-nohost-'))
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }
  process.env.HOME = process.env.USERPROFILE = home // os.homedir() reads these at call time
  try {
    const tools = install.allTargets({}).map((t) => t[0])
    assert.deepEqual(tools, ['claude', 'codex'])
    const pointed = install.allTargets({ CURSOR_HOME: path.join(home, 'c'), GEMINI_HOME: path.join(home, 'g') }).map((t) => t[0])
    assert.deepEqual(pointed, ['claude', 'codex', 'cursor', 'antigravity'], 'an explicit location is honoured')
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(home, { recursive: true, force: true })
  }
})
