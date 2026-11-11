'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const doctor = require('../lib/doctor')
const install = require('../lib/install')
const agents = require('../lib/agents')
const ROOT = path.resolve(__dirname, '..')

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-doctor-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const cwd = path.join(home, 'project with Unicode \u03bb')
  fs.mkdirSync(cwd, { recursive: true })
  const env = {
    HOME: home, USERPROFILE: home, GODKIT_HOME: path.join(home, '.godkit'),
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'), CODEX_HOME: path.join(home, '.codex'),
    CURSOR_HOME: path.join(home, '.cursor'), GEMINI_HOME: path.join(home, '.gemini'),
  }
  return { home, cwd, env, root: ROOT, timeoutMs: 5000 }
}

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
}

function configured(o, host = 'codex') {
  write(path.join(o.cwd, '.agent', 'BOARD.md'), '# Board')
  write(path.join(o.cwd, '.agent', 'THREAD.md'), '# Thread')
  write(path.join(o.cwd, 'AGENTS.md'), '# Rules')
  agents.syncAgents(o.cwd, 'sync', false)
  const skills = fs.readdirSync(path.join(ROOT, 'skills'))
  for (const skill of skills) write(path.join(o.cwd, host === 'claude' ? '.claude' : '.agents', 'skills', skill, 'SKILL.md'), '# Fixture skill')
  const where = doctor.locations(o.env)[host]
  const applied = install.applyHooks({}, { hooksDir: path.join(ROOT, 'hooks'), kind: host })
  write(where.hooks, JSON.stringify(applied.settings))
  const server = { command: process.execPath, args: [path.join(ROOT, 'bin', 'godkit.js'), 'mcp'] }
  write(where.mcp, host === 'codex'
    ? '[mcp_servers.godkit]\ncommand = ' + JSON.stringify(server.command) + '\nargs = ' + JSON.stringify(server.args) + '\n'
    : JSON.stringify({ mcpServers: { godkit: server } }))
  return where
}

function fakeServer(t, script) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-health-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  write(path.join(root, 'bin', 'godkit.js'), script)
  return root
}

test('MCP health exercises the real server and identifies only local-server evidence', async () => {
  const result = await doctor.probeMcp({ root: ROOT, timeoutMs: 5000 })
  assert.equal(result.status, 'verified')
  assert.equal(result.scope, 'local-server')
  assert.ok(result.toolCount >= 9)
  assert.match(result.message, /host connection is not verified/)
})

test('MCP health rejects noise and protocol failures without exposing stderr secrets', async (t) => {
  const cases = [
    ["console.error('SECRET_TOKEN_VALUE'); console.log('startup banner')", /non-protocol/],
    ["console.log(JSON.stringify({jsonrpc:'2.0',id:1,error:{message:'SECRET_TOKEN_VALUE'}}))", /invalid protocol/],
    ["console.log(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-06-18',capabilities:{}}}))", /advertise tools/],
  ]
  for (const [script, reason] of cases) {
    const result = await doctor.probeMcp({ root: fakeServer(t, script), timeoutMs: 3000 })
    assert.equal(result.status, 'error')
    assert.match(result.message, reason)
    assert.ok(!JSON.stringify(result).includes('SECRET_TOKEN_VALUE'))
  }
})

test('MCP health stops hanging servers and reports early exit and missing runtime', async (t) => {
  const hang = await doctor.probeMcp({ root: fakeServer(t, 'setInterval(() => {}, 1000)'), timeoutMs: 60 })
  assert.match(hang.message, /timed out/)
  const exit = await doctor.probeMcp({ root: fakeServer(t, 'process.exit(0)'), timeoutMs: 3000 })
  assert.match(exit.message, /exited before/)
  const missing = await doctor.probeMcp({ root: ROOT, node: path.join(os.tmpdir(), 'godkit-no-such-node'), timeoutMs: 3000 })
  assert.equal(missing.status, 'error')
  assert.match(missing.message, /Could not start/)
})

test('fresh-machine inspection is read-only, isolated by env and never declares readiness', async (t) => {
  const o = fixture(t)
  const result = await doctor.inspect(o)
  assert.equal(result.ready, false)
  assert.equal(result.project.status, 'needs_action')
  assert.ok(result.hosts.every((h) => h.installed === false))
  assert.ok(!fs.existsSync(o.env.GODKIT_HOME))
  assert.ok(!fs.existsSync(o.env.CODEX_HOME))
})

test('configured assets and a healthy local MCP do not imply host approval or native execution', async (t) => {
  const o = fixture(t)
  configured(o)
  const result = await doctor.inspect(o)
  const host = result.hosts.find((h) => h.host === 'codex')
  assert.equal(result.project.status, 'configured')
  assert.equal(result.mcp.status, 'verified')
  assert.equal(host.features.skills.status, 'configured')
  assert.equal(host.features.roles.status, 'configured')
  assert.equal(host.features.hooks.status, 'configured')
  assert.match(host.features.hooks.message, /Review hooks/)
  assert.equal(host.features.mcp.status, 'configured')
  assert.equal(host.features.native_agents.status, 'needs_action')
  assert.equal(host.features.peer_messaging.status, 'needs_action')
  assert.equal(host.ready, false)
  assert.equal(result.ready, false)
})

test('a real hook observation promotes hooks only and must follow the current configuration', async (t) => {
  const o = fixture(t)
  const target = configured(o)
  const old = new Date(Date.now() - 60000).toISOString()
  write(path.join(o.env.GODKIT_HOME, 'seen.json'), JSON.stringify({ codex: { default: { at: old, count: 1 } } }))
  assert.equal((await doctor.inspect(o)).hosts.find((h) => h.host === 'codex').features.hooks.status, 'configured')
  const future = new Date(Date.now() + 1000).toISOString()
  write(path.join(o.env.GODKIT_HOME, 'seen.json'), JSON.stringify({ codex: { default: { at: future, count: 2 } } }))
  const result = await doctor.inspect(o)
  const host = result.hosts.find((h) => h.host === 'codex')
  assert.equal(host.features.hooks.status, 'verified')
  assert.equal(host.features.mcp.status, 'configured')
  assert.equal(host.features.native_agents.status, 'needs_action')
  assert.ok(fs.existsSync(target.hooks))
})

test('unknown custom-role hosts remain explicitly unsupported while available features are checked', async (t) => {
  const o = fixture(t)
  fs.mkdirSync(o.env.CURSOR_HOME, { recursive: true })
  fs.mkdirSync(path.join(o.env.GEMINI_HOME, 'antigravity'), { recursive: true })
  const result = await doctor.inspect(o)
  for (const name of ['cursor', 'antigravity']) {
    const host = result.hosts.find((h) => h.host === name)
    assert.equal(host.installed, true)
    assert.equal(host.features.roles.status, 'unsupported')
    assert.equal(host.ready, false)
  }
})

test('malformed or foreign configuration is an error and is never changed by inspection', async (t) => {
  const o = fixture(t)
  const target = configured(o)
  const raw = '{"private":"SECRET_TOKEN_VALUE",broken'
  write(target.hooks, raw)
  const result = await doctor.inspect(o)
  const host = result.hosts.find((h) => h.host === 'codex')
  assert.equal(host.features.hooks.status, 'error')
  assert.equal(result.status, 'error')
  assert.ok(!JSON.stringify(result).includes('SECRET_TOKEN_VALUE'))
  assert.equal(fs.readFileSync(target.hooks, 'utf8'), raw)
  write(target.mcp, '[mcp_servers.godkit]\ncommand = "other"\nargs = ["unrelated.js"]\n')
  const foreign = await doctor.inspect(o)
  assert.match(foreign.hosts.find((h) => h.host === 'codex').features.mcp.message, /not owned/)
})

test('evidence is explicitly attributed and cannot combine different projects, packages or host versions', async (t) => {
  const o = fixture(t)
  configured(o)
  const base = { ...o, host: 'codex', surface: 'ide', hostVersion: 'fixture-1', session: 'fixture-session', source: 'host-session' }
  assert.throws(() => doctor.recordEvidence({ ...base, feature: 'native_agents', source: 'unit-test' }), /host-session/)
  assert.throws(() => doctor.recordEvidence({ ...base, feature: 'native_agents', session: '' }), /session/)
  assert.throws(() => doctor.recordEvidence({ ...base, feature: 'invented' }), /unknown/)
  for (const name of doctor.FEATURES) doctor.recordEvidence({ ...base, feature: name })
  const recorded = await doctor.inspect(o)
  const host = recorded.hosts.find((h) => h.host === 'codex')
  assert.equal(host.ready, true, 'fixture evidence tests promotion semantics; it is not published as a real host check')
  assert.equal(host.verifiedFor.hostVersion, 'fixture-1')
  assert.match(host.features.native_agents.attribution, /self-report/)
  const later = new Date(Date.now() + 1000).toISOString()
  doctor.recordEvidence({ ...base, feature: 'native_agents', hostVersion: 'fixture-2', observedAt: later })
  const changed = (await doctor.inspect(o)).hosts.find((h) => h.host === 'codex')
  assert.equal(changed.features.native_agents.status, 'verified')
  assert.equal(changed.features.peer_messaging.status, 'needs_action', 'prior version evidence is not reused')
  assert.equal(changed.ready, false)
  const other = { ...o, cwd: path.join(o.home, 'different-project') }
  fs.mkdirSync(other.cwd)
  assert.equal((await doctor.inspect(other)).hosts.find((h) => h.host === 'codex').features.native_agents.status, 'needs_action')
})

test('repair runs only the supplied installer callback, reports failure and remains explicit', async (t) => {
  const o = fixture(t)
  const untouched = path.join(o.home, 'foreign-config.json')
  write(untouched, '{"keep":true}')
  let count = 0
  const repair = () => { count++; configured(o) }
  const first = await doctor.fix({ ...o, repair })
  const second = await doctor.fix({ ...o, repair })
  assert.equal(count, 2)
  assert.equal(first.repair.completed, true)
  assert.equal(second.repair.completed, true)
  assert.equal(first.ready, false, 'repair cannot grant host approval or invent native evidence')
  assert.equal(fs.readFileSync(untouched, 'utf8'), '{"keep":true}')
  const failed = await doctor.fix({ ...o, repair: () => { throw Error('SECRET_TOKEN_VALUE') } })
  assert.equal(failed.repair.completed, false)
  assert.equal(failed.status, 'error')
  assert.ok(!JSON.stringify(failed).includes('SECRET_TOKEN_VALUE'))
  await assert.rejects(doctor.fix(o), /explicit repair callback/)
})

test('host evidence is bound to actual skill, role and hook bytes, not reinstall timestamps', async (t) => {
  for (const name of ['skills', 'roles', 'hooks']) {
    const o = fixture(t)
    const target = configured(o)
    const base = { ...o, host: 'codex', surface: 'ide', hostVersion: 'fixture-1', session: 'fixture-session', source: 'host-session' }
    for (const capability of doctor.FEATURES) doctor.recordEvidence({ ...base, feature: capability })
    const file = name === 'skills' ? path.join(o.cwd, '.agents/skills/godkit-lazy/SKILL.md')
      : name === 'roles' ? path.join(o.cwd, '.codex/agents/godkit-explorer.toml') : target.hooks
    const raw = fs.readFileSync(file, 'utf8')
    fs.writeFileSync(file, raw)
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000))
    assert.equal((await doctor.inspect(o)).hosts.find((h) => h.host === 'codex').features[name].status, 'verified', 'identical reinstall must keep valid evidence')
    if (name === 'hooks') {
      const changed = JSON.parse(raw)
      install.ourHandlers(changed, 'codex')[0].command += ' --fixture-change'
      fs.writeFileSync(file, JSON.stringify(changed))
    } else fs.writeFileSync(file, raw + '\nChanged fixture asset.\n')
    const changed = (await doctor.inspect(o)).hosts.find((h) => h.host === 'codex')
    assert.notEqual(changed.features[name].status, 'verified', name + ' evidence must be invalidated by changed bytes')
    assert.equal(changed.ready, false)
  }
})

test('rules changes invalidate native and peer observations and legacy digest-free records cannot promote', async (t) => {
  const o = fixture(t)
  configured(o)
  const base = { ...o, host: 'codex', surface: 'ide', hostVersion: 'fixture-1', session: 'fixture-session', source: 'host-session' }
  for (const name of doctor.FEATURES) doctor.recordEvidence({ ...base, feature: name })
  fs.appendFileSync(path.join(o.cwd, 'AGENTS.md'), '\nChanged fixture rules.\n')
  const changed = (await doctor.inspect(o)).hosts.find((h) => h.host === 'codex')
  assert.equal(changed.features.native_agents.status, 'needs_action')
  assert.equal(changed.features.peer_messaging.status, 'needs_action')
  assert.equal(changed.features.skills.status, 'verified')
  const file = path.join(o.env.GODKIT_HOME, 'capabilities.json')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const entry of data.entries) delete entry.assetDigest
  fs.writeFileSync(file, JSON.stringify(data))
  const legacy = (await doctor.inspect(o)).hosts.find((h) => h.host === 'codex')
  assert.equal(legacy.features.skills.status, 'configured')
  assert.equal(legacy.ready, false)
})
