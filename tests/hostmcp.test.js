'use strict'
// Registering with hosts and the git hook touch files that belong to the user and to other tools.
// What these pin down: ours is added and removed, theirs is never rewritten, and a refusal is
// loud rather than an overwrite. Also the guard through the adapter, where the permission
// answer each host reads is the whole point.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const BIN = path.join(ROOT, 'bin', 'godkit.js')
const hostmcp = require('../lib/hostmcp')
const board = require('../lib/board')

const tmp = (p) => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), p)))

// --- MCP registration -------------------------------------------------------------------------

test('json hosts: ours is added next to theirs, replaced not duplicated, and removed alone', () => {
  const theirs = JSON.stringify({ mcpServers: { codegraph: { command: 'codegraph', args: ['serve'] } }, other: 1 })
  const once = hostmcp.applyJson(theirs, false, BIN)
  const doc = JSON.parse(once)
  assert.deepEqual(doc.mcpServers.codegraph, { command: 'codegraph', args: ['serve'] })
  assert.equal(doc.mcpServers.godkit.args[1], 'mcp')
  assert.equal(doc.other, 1)
  assert.equal(hostmcp.applyJson(once, false, BIN), null, 'already so: no write')
  assert.deepEqual(JSON.parse(hostmcp.applyJson(once, true, BIN)), JSON.parse(theirs))
  assert.equal(hostmcp.applyJson(theirs, true, BIN), null, 'nothing of ours to remove')
  assert.ok(JSON.parse(hostmcp.applyJson('', false, BIN)).mcpServers.godkit, 'an empty file is fine')
})

test('json hosts: a server named godkit that is not ours is refused, an unreadable file is left alone', () => {
  const foreign = JSON.stringify({ mcpServers: { godkit: { command: 'something-else', args: ['x'] } } })
  assert.throws(() => hostmcp.applyJson(foreign, false, BIN), /not ours/)
  assert.throws(() => hostmcp.applyJson('{ nope', false, BIN))
})

test('codex toml: a table is appended and removed as text, the rest of the file byte-for-byte', () => {
  const theirs = '[mcp_servers.codegraph]\ncommand = "codegraph"\nargs = ["serve", "--mcp"]\n\n[features]\nhooks = true\n'
  const once = hostmcp.applyToml(theirs, false, BIN)
  assert.ok(once.startsWith(theirs.trimEnd()), 'nothing above ours changed')
  assert.match(once, /\[mcp_servers\.godkit\]\ncommand = "node"\nargs = \["[^"]*bin\/godkit\.js", "mcp"\]/)
  assert.equal(hostmcp.applyToml(once, false, BIN), null)
  assert.equal(hostmcp.applyToml(once, true, BIN).trim(), theirs.trim())
  assert.equal(hostmcp.applyToml(theirs, true, BIN), null)
  assert.throws(() => hostmcp.applyToml('[mcp_servers.godkit]\ncommand = "other"\n', false, BIN), /not ours/)
})

test('mcp install writes only the hosts that are there, keeps a backup, and uninstall undoes it', () => {
  const home = tmp('godkit-mcphome-')
  const env = { CURSOR_HOME: path.join(home, 'cursor'), GEMINI_HOME: path.join(home, 'gemini'), CODEX_HOME: path.join(home, 'codex'), GODKIT_NO_CLAUDE_CLI: '1' }
  fs.mkdirSync(env.CURSOR_HOME)
  fs.writeFileSync(path.join(env.CURSOR_HOME, 'mcp.json'), JSON.stringify({ mcpServers: { codegraph: { command: 'cg' } } }))

  const run = (...args) => execFileSync(process.execPath, [BIN, 'mcp', ...args], { encoding: 'utf8', env: { ...process.env, ...env } })
  assert.match(run('install', '--dry-run'), /would install/)
  assert.equal(fs.existsSync(path.join(env.GEMINI_HOME, 'config', 'mcp_config.json')), false, 'dry run writes nothing')

  run('install')
  const cursor = JSON.parse(fs.readFileSync(path.join(env.CURSOR_HOME, 'mcp.json'), 'utf8'))
  assert.ok(cursor.mcpServers.godkit && cursor.mcpServers.codegraph)
  assert.ok(fs.existsSync(path.join(env.CURSOR_HOME, 'mcp.json.bak')))
  assert.match(fs.readFileSync(path.join(env.CODEX_HOME, 'config.toml'), 'utf8'), /\[mcp_servers\.godkit\]/)

  run('uninstall')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.CURSOR_HOME, 'mcp.json'), 'utf8')), { mcpServers: { codegraph: { command: 'cg' } } })
  assert.doesNotMatch(fs.readFileSync(path.join(env.CODEX_HOME, 'config.toml'), 'utf8'), /godkit/)
  fs.rmSync(home, { recursive: true, force: true })
})

// --- git pre-commit ---------------------------------------------------------------------------

function repo(rows) {
  const d = tmp('godkit-githook-')
  const git = (...a) => execFileSync('git', a, { cwd: d, stdio: 'ignore' })
  git('init', '-q')
  git('config', 'user.email', 't@example.com')
  git('config', 'user.name', 't')
  fs.mkdirSync(path.join(d, '.agent'))
  fs.writeFileSync(
    path.join(d, '.agent', 'BOARD.md'),
    '# Board\n\n## Now (claims)\n\n| agent | scope (file globs) | task | since (UTC) | status |\n|---|---|---|---|---|\n' + rows + '\n\n## Tasks\n',
  )
  fs.mkdirSync(path.join(d, 'lib'))
  fs.writeFileSync(path.join(d, 'lib', 'a.js'), '1\n')
  fs.writeFileSync(path.join(d, 'other.js'), '1\n')
  return { d, git }
}

const NOW = new Date().toISOString().slice(0, 16) + 'Z'
const LIVE = '| claude-opus-5 | lib/* | work | ' + NOW + ' | wip |'

function checkStaged(d, env) {
  const r = spawnSync(process.execPath, [BIN, 'check-staged'], { cwd: d, encoding: 'utf8', env: { ...process.env, ...env } })
  return { code: r.status, err: r.stderr }
}

test('check-staged lists files outside every live claim, and blocks only when asked to', () => {
  const { d, git } = repo(LIVE)
  git('add', 'lib/a.js', 'other.js')
  const warn = checkStaged(d)
  assert.equal(warn.code, 0)
  assert.match(warn.err, /1 staged file is outside every live claim/)
  assert.match(warn.err, /other\.js/)
  assert.doesNotMatch(warn.err, /lib\/a\.js/)
  assert.equal(checkStaged(d, { GODKIT_STRICT: '1' }).code, 1)
  git('config', 'godkit.strict', 'true')
  assert.equal(checkStaged(d).code, 1, 'git config godkit.strict makes it a repo policy')
  fs.rmSync(d, { recursive: true, force: true })
})

test('check-staged says nothing when every staged file is claimed, or when nobody holds a claim', () => {
  const claimed = repo(LIVE)
  claimed.git('add', 'lib/a.js')
  assert.deepEqual(checkStaged(claimed.d), { code: 0, err: '' })
  fs.rmSync(claimed.d, { recursive: true, force: true })

  const nobody = repo('| — | nothing claimed | — | — | free |')
  nobody.git('add', 'other.js')
  assert.deepEqual(checkStaged(nobody.d), { code: 0, err: '' }, 'no live claim: the protocol is not in use right now')
  assert.equal(checkStaged(nobody.d, { GODKIT_STRICT: '1' }).code, 1, 'unless the repo says otherwise')
  fs.rmSync(nobody.d, { recursive: true, force: true })
})

test('the pre-commit hook is installed, run by git, and removed; someone else\'s hook is never replaced', () => {
  const { d, git } = repo(LIVE)
  const hook = (...a) => execFileSync(process.execPath, [BIN, 'githook', ...a], { cwd: d, encoding: 'utf8' })
  assert.match(hook('install'), /install/)
  const file = path.join(d, '.git', 'hooks', 'pre-commit')
  assert.match(fs.readFileSync(file, 'utf8'), /godkit:pre-commit/)
  assert.match(hook('status'), /installed/)

  git('config', 'godkit.strict', 'true')
  git('add', 'other.js')
  assert.throws(() => execFileSync('git', ['commit', '-qm', 'x'], { cwd: d, stdio: 'pipe' }), /outside every live claim/, 'git ran the hook and it blocked the commit')
  git('add', '-f', 'lib/a.js')
  git('reset', '-q', 'other.js')
  execFileSync('git', ['commit', '-qm', 'claimed file'], { cwd: d, stdio: 'pipe' })

  assert.match(hook('uninstall'), /uninstall/)
  assert.equal(fs.existsSync(file), false)

  fs.writeFileSync(file, '#!/bin/sh\necho theirs\n')
  const refused = spawnSync(process.execPath, [BIN, 'githook', 'install'], { cwd: d, encoding: 'utf8' })
  assert.equal(refused.status, 1)
  assert.match(refused.stdout, /not ours/)
  assert.equal(fs.readFileSync(file, 'utf8'), '#!/bin/sh\necho theirs\n')
  fs.rmSync(d, { recursive: true, force: true })
})

// --- the guard through the adapter --------------------------------------------------------------

const STATE = tmp('godkit-adaptguard-state-')
process.on('exit', () => fs.rmSync(STATE, { recursive: true, force: true }))
const adapt = (host, event, input) =>
  JSON.parse(
    execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'adapt.js'), host, event], {
      input: JSON.stringify(input),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_CONFIG_DIR: STATE, PLUGIN_DATA: '', CODEX_HOME: '' },
    }),
  )

test('cursor: a dangerous shell command is denied, a matched-but-fine one is asked about, never allowed', () => {
  const { d } = repo(LIVE)
  const base = { conversation_id: 'cur-guard-1', cwd: d, workspace_roots: [d] }
  const denied = adapt('cursor', 'beforeShellExecution', { ...base, command: 'git push --force origin main' })
  assert.equal(denied.permission, 'deny')
  assert.match(denied.agent_message, /force-with-lease/)
  const asked = adapt('cursor', 'beforeShellExecution', { ...base, command: 'git push origin main' })
  assert.deepEqual(asked, { permission: 'ask' }, 'never a bare allow: Cursor does not say what that does to its own prompt')
  fs.rmSync(d, { recursive: true, force: true })
})

test('cursor registers beforeShellExecution with the trigger as its matcher, so ordinary commands never reach the hook', () => {
  const install = require('../lib/install')
  const result = install.applyHooks({}, { kind: 'cursor', hooksDir: path.join(ROOT, 'hooks') })
  const entry = result.settings.hooks.beforeShellExecution[0]
  assert.equal(entry.matcher, require('../lib/guard').SHELL_TRIGGER)
  assert.equal(result.settings.hooks.preToolUse, undefined, 'no PreToolUse on every tool for Cursor')
  assert.equal(new RegExp(entry.matcher).test('npm test'), false)
})

test('antigravity: PreToolUse denies the dangerous, and otherwise answers allow, which Antigravity documents as "delegate"', () => {
  const { d } = repo(LIVE)
  const base = { conversationId: 'agy-guard-1', workspacePaths: [d] }
  const run = (name, args) => adapt('antigravity', 'PreToolUse', { ...base, stepIdx: 1, toolCall: { name, args } })

  const denied = run('run_command', { CommandLine: 'rm -rf /', Cwd: d })
  assert.equal(denied.decision, 'deny')
  assert.match(denied.reason, /rm -r/)
  assert.deepEqual(run('run_command', { CommandLine: 'npm test', Cwd: d }), { decision: 'allow' })
  assert.equal(run('write_to_file', { TargetFile: path.join(d, '.env'), CodeContent: 'x' }).decision, 'deny')
  assert.equal(run('replace_file_content', { TargetFile: path.join(d, 'lib', 'a.js') }).decision, 'allow')
  assert.deepEqual(run('view_file', { AbsolutePath: path.join(d, '.env') }), { decision: 'allow' }, 'reading is not the guard\'s business')
  fs.rmSync(d, { recursive: true, force: true })
})

test('antigravity: a Bash-only change is now seen, because the before-snapshot can be taken', () => {
  const { d } = repo(LIVE)
  const base = { conversationId: 'agy-shell-1', workspacePaths: [d] }
  const step = { stepIdx: 4, toolCall: { name: 'run_command', args: { CommandLine: 'echo 2 > other.js', Cwd: d } } }
  adapt('antigravity', 'PreToolUse', { ...base, ...step })
  fs.writeFileSync(path.join(d, 'other.js'), '2\n')
  adapt('antigravity', 'PostToolUse', { ...base, ...step, error: '' })
  const stop = adapt('antigravity', 'Stop', { ...base, terminationReason: 'model_stop', fullyIdle: true })
  assert.equal(stop.decision, 'continue')
  assert.match(stop.reason, /Clock out first/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('board.unclaimed is what check-staged uses; the module agrees with the CLI', () => {
  // The shipped template, not this repo's own board: .agent/ is local-only here, so a checkout
  // (CI) does not have one.
  assert.deepEqual(board.unclaimed(fs.readFileSync(path.join(ROOT, 'templates', 'BOARD.md'), 'utf8'), ['.agent/x.md']), [])
})
