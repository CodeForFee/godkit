'use strict'
// Two things that make "it runs by itself" checkable and real: a ledger of which agent and surface
// last ran a godkit hook, and an opt-in that sets a project up at its first session.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const BIN = path.join(ROOT, 'bin', 'godkit.js')
const seen = require('../lib/seen')

const tmp = (p) => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), p)))
const rm = (d) => fs.rmSync(d, { recursive: true, force: true })

// --- the ledger -------------------------------------------------------------------------------

test('the agent is read from where its transcript lives, the surface from Claude Code\'s own entrypoint', () => {
  assert.equal(seen.hostFrom('C:\\Users\\a\\.claude\\projects\\x\\s.jsonl'), 'claude')
  assert.equal(seen.hostFrom('/home/a/.codex/sessions/2026/s.jsonl'), 'codex')
  assert.equal(seen.hostFrom('/home/a/.cursor/projects/x/t.txt'), 'cursor')
  assert.equal(seen.hostFrom('/home/a/.gemini/antigravity/c.jsonl'), 'antigravity')
  assert.equal(seen.hostFrom('/tmp/unknown.jsonl'), null)
  assert.equal(seen.surfaceFrom('claude', { CLAUDE_CODE_ENTRYPOINT: 'claude-desktop' }), 'desktop')
  assert.equal(seen.surfaceFrom('claude', { CLAUDE_CODE_ENTRYPOINT: 'claude-vscode' }), 'vscode')
  assert.equal(seen.surfaceFrom('claude', { CLAUDE_CODE_ENTRYPOINT: 'cli' }), 'cli')
  assert.equal(seen.surfaceFrom('codex', { CLAUDE_CODE_ENTRYPOINT: 'cli' }), 'default', 'only Claude says which surface')
})

test('recording keeps one line per agent and surface, counts, and never throws', () => {
  const home = tmp('godkit-seen-')
  const env = { GODKIT_HOME: home, CLAUDE_CODE_ENTRYPOINT: 'claude-vscode' }
  assert.equal(seen.record({ transcript_path: '/u/.claude/p/s.jsonl' }, null, env), true)
  assert.equal(seen.record({ transcript_path: '/u/.claude/p/s.jsonl' }, null, env), true)
  assert.equal(seen.record({ godkit_host: 'cursor' }, null, env), true)
  assert.equal(seen.record({ transcript_path: '/tmp/nowhere' }, null, env), false, 'an unknown agent is not guessed')
  const rows = Object.fromEntries(seen.summary(env).map((r) => [r.host, r.seen]))
  assert.equal(rows.claude[0].surface, 'vscode')
  assert.equal(rows.claude[0].count, 2)
  assert.equal(rows.cursor[0].surface, 'default')
  assert.deepEqual(rows.codex, [])
  assert.equal(seen.record({}, 'claude', { GODKIT_HOME: path.join(home, 'seen.json', 'not-a-dir') }), false, 'an unwritable ledger is silent')
  assert.match(seen.ago(new Date(Date.now() - 5 * 60 * 1000).toISOString()), /5 min ago/)
  rm(home)
})

test('a SessionStart through the brief hook leaves its mark; through the adapter, the host it knows', () => {
  const home = tmp('godkit-seen2-')
  const d = tmp('godkit-seen2-repo-')
  execFileSync('git', ['init', '-q'], { cwd: d })
  fs.mkdirSync(path.join(d, '.agent'))
  fs.writeFileSync(path.join(d, '.agent', 'BOARD.md'), '# Board\n')
  const env = { ...process.env, GODKIT_HOME: home, CLAUDE_CONFIG_DIR: home, CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', PLUGIN_DATA: '', CODEX_HOME: '' }

  execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'brief.js')], { input: JSON.stringify({ cwd: d, session_id: 'seen0001', transcript_path: '/u/.claude/projects/x/s.jsonl' }), env, stdio: ['pipe', 'pipe', 'pipe'] })
  execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'adapt.js'), 'antigravity', 'SessionStart'], { input: JSON.stringify({ conversationId: 'agy-seen-1', workspacePaths: [d] }), env, stdio: ['pipe', 'pipe', 'pipe'] })

  const rows = Object.fromEntries(seen.summary({ GODKIT_HOME: home }).map((r) => [r.host, r.seen]))
  assert.equal(rows.claude[0].surface, 'desktop')
  assert.equal(rows.antigravity.length, 1)
  rm(home)
  rm(d)
})

test('doctor says "never" for an agent that has not run us, with what to do about it', () => {
  const home = tmp('godkit-seen3-')
  const out = execFileSync(process.execPath, [BIN, 'doctor'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GODKIT_HOME: home, CURSOR_HOME: path.join(home, 'c'), GEMINI_HOME: path.join(home, 'g') } })
  assert.match(out, /last seen/)
  assert.match(out, /codex\s+never — approve the hooks once/)
  rm(home)
})

// --- auto-init --------------------------------------------------------------------------------

function codeRepo() {
  const d = tmp('godkit-auto-')
  execFileSync('git', ['init', '-q'], { cwd: d })
  fs.writeFileSync(path.join(d, 'app.js'), 'module.exports = 1\n')
  return d
}

const brief = (d, env) =>
  execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'brief.js')], {
    input: JSON.stringify({ cwd: d, session_id: 'auto0001' }),
    encoding: 'utf8',
    env: { ...process.env, PLUGIN_DATA: '', CODEX_HOME: '', ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

test('off by default: a code repo with no .agent/ only gets the hint, and nothing is written', () => {
  const d = codeRepo()
  const out = brief(d, { GODKIT_AUTO_INIT: '0' })
  assert.match(out, /No \.agent\/ here/)
  assert.equal(fs.existsSync(path.join(d, '.agent')), false)
  rm(d)
})

test('on: the first session sets the project up, and the brief that session already reads from it', () => {
  const d = codeRepo()
  const out = brief(d, { GODKIT_AUTO_INIT: '1' })
  assert.ok(fs.existsSync(path.join(d, '.agent', 'BOARD.md')))
  assert.ok(fs.existsSync(path.join(d, 'AGENTS.md')), 'the rule files')
  assert.ok(fs.existsSync(path.join(d, '.claude', 'skills')), 'the skills')
  assert.match(out, /Handoff \(\.agent\/\)/)
  assert.doesNotMatch(out, /No \.agent\/ here/)
  rm(d)
})

test('on, but not in a folder that is not a git repository', () => {
  const d = tmp('godkit-auto-nogit-')
  fs.writeFileSync(path.join(d, 'app.js'), 'module.exports = 1\n')
  const out = brief(d, { GODKIT_AUTO_INIT: '1' })
  assert.match(out, /No \.agent\/ here/)
  assert.equal(fs.existsSync(path.join(d, '.agent')), false)
  rm(d)
})

test('godkit autoinit on/off writes the setting and reads it back; the environment still wins', () => {
  const xdg = tmp('godkit-autocfg-')
  const run = (...a) => spawnSync(process.execPath, [BIN, 'autoinit', ...a], { encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: xdg, GODKIT_AUTO_INIT: '' } }).stdout
  assert.match(run(), /autoinit: off/)
  assert.match(run('on'), /autoinit: on/)
  assert.equal(JSON.parse(fs.readFileSync(path.join(xdg, 'godkit', 'config.json'), 'utf8')).autoInit, true)
  assert.match(run('status'), /autoinit: on/)
  assert.match(run('off'), /autoinit: off/)
  const forced = spawnSync(process.execPath, [BIN, 'autoinit', 'status'], { encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: xdg, GODKIT_AUTO_INIT: '1' } }).stdout
  assert.match(forced, /autoinit: on.*GODKIT_AUTO_INIT is set/)
  rm(xdg)
})
