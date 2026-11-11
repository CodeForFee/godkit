'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const ROOT = path.resolve(__dirname, '..')
const BIN = path.join(ROOT, 'bin', 'godkit.js')

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit doctor cli \u03bb '))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const project = path.join(home, 'consumer project')
  fs.mkdirSync(project)
  const cwd = fs.realpathSync.native(project)
  const env = {
    ...process.env, HOME: home, USERPROFILE: home, GODKIT_HOME: path.join(home, 'godkit'),
    XDG_CONFIG_HOME: path.join(home, 'config'), APPDATA: path.join(home, 'appdata'), LOCALAPPDATA: path.join(home, 'localappdata'),
    CLAUDE_CONFIG_DIR: path.join(home, 'claude'), CODEX_HOME: path.join(home, 'codex'),
    CURSOR_HOME: path.join(home, 'cursor'), GEMINI_HOME: path.join(home, 'gemini'),
    GODKIT_NO_CLAUDE_CLI: '1', GODKIT_FORCE_STABLE: '0', GODKIT_STABLE_CHILD: '1', NO_COLOR: '1',
  }
  const run = (...args) => spawnSync(process.execPath, [BIN, 'doctor', ...args], { cwd, env, encoding: 'utf8', timeout: 20000, windowsHide: true })
  return { home, cwd, env, run }
}

test('doctor --json emits one parseable report and leaves a fresh private home unchanged', (t) => {
  const o = fixture(t)
  const out = o.run('--json')
  assert.equal(out.status, 0, out.stderr)
  const report = JSON.parse(out.stdout)
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.ready, false)
  assert.equal(report.mcp.status, 'verified')
  assert.equal(report.project.path, o.cwd)
  assert.ok(report.hosts.every((h) => !h.installed))
  assert.deepEqual(fs.readdirSync(o.home), ['consumer project'])
})

test('doctor --fix --json preserves JSON stdout, uses isolated paths and does not invent host verification', (t) => {
  const o = fixture(t)
  const out = o.run('--fix', '--json')
  assert.equal(out.status, 0, out.stderr + out.stdout)
  const report = JSON.parse(out.stdout)
  assert.equal(report.repair.completed, true)
  assert.equal(report.project.status, 'configured')
  assert.equal(report.ready, false)
  assert.ok(report.hosts.filter((h) => h.installed).every((h) => !h.ready))
  assert.ok(fs.existsSync(path.join(o.env.CODEX_HOME, 'config.toml')))
  assert.ok(fs.existsSync(path.join(o.cwd, '.codex/agents/godkit-explorer.toml')))
  assert.ok(fs.existsSync(path.join(o.cwd, '.agents/agents/godkit-explorer.md')))
  const antigravity = report.hosts.find((h) => h.host === 'antigravity')
  assert.equal(antigravity.features.roles.status, 'configured')
  assert.equal(antigravity.features.skills.status, 'configured')
  assert.equal(antigravity.features.native_agents.status, 'needs_action')
  assert.equal(antigravity.features.peer_messaging.status, 'needs_action')
  assert.ok(fs.existsSync(path.join(o.cwd, '.agent/BOARD.md')))
  const second = o.run('--fix', '--json')
  assert.equal(second.status, 0, second.stderr + second.stdout)
  assert.equal(JSON.parse(second.stdout).repair.completed, true)
})

test('doctor --fix --json reports malformed configuration without changing its bytes or leaking excerpts', (t) => {
  const o = fixture(t)
  fs.mkdirSync(o.env.CODEX_HOME)
  const file = path.join(o.env.CODEX_HOME, 'hooks.json')
  const raw = '{"private":"SECRET_FIXTURE_VALUE", broken'
  fs.writeFileSync(file, raw)
  const out = o.run('--fix', '--json')
  assert.equal(out.status, 1)
  const report = JSON.parse(out.stdout)
  assert.equal(report.repair.completed, false)
  assert.equal(report.status, 'error')
  assert.equal(fs.readFileSync(file, 'utf8'), raw)
  assert.ok(!out.stdout.includes('SECRET_FIXTURE_VALUE'))
})

test('doctor --record-evidence --json records only explicit attributed data bound to the consumer project', (t) => {
  const o = fixture(t)
  const initialized = o.run('--fix', '--json')
  assert.equal(initialized.status, 0, initialized.stderr + initialized.stdout)
  const file = path.join(o.home, 'observed-fixture.json')
  fs.writeFileSync(file, JSON.stringify({ host: 'codex', feature: 'native_agents', surface: 'ide', hostVersion: 'fixture-version', session: 'fixture-session', source: 'host-session', cwd: ROOT }))
  const out = o.run('--record-evidence', file, '--json')
  assert.equal(out.status, 0, out.stderr + out.stdout)
  const report = JSON.parse(out.stdout)
  const capability = report.hosts.find((h) => h.host === 'codex').features.native_agents
  assert.equal(capability.status, 'verified', 'fixture tests the reporting interface, not real host support')
  assert.equal(capability.evidence.project, o.cwd, 'an input JSON cannot attribute evidence to a different project')
  assert.equal(capability.evidence.source, 'host-session')
  assert.match(capability.evidence.assetDigest, /^[a-f0-9]{64}$/)
  assert.match(capability.attribution, /self-report/)
  assert.equal(report.ready, false, 'one native observation does not prove all host features')
})
