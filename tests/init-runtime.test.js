'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const ROOT = path.resolve(__dirname, '..')
const BIN = path.join(ROOT, 'bin/godkit.js')

test('init refuses the Godkit source repository before modifying generator rules', () => {
  const before = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8')
  const out = spawnSync(process.execPath, [BIN, 'init', '--no-install'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(out.status, 1)
  assert.match(out.stderr, /generator source/)
  assert.equal(fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8'), before)
})

test('init reports a broken role source and exits unsuccessfully instead of pretending readiness', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit init Việt '))
  try {
    const pkg = path.join(dir, 'package')
    const project = path.join(dir, 'project')
    fs.mkdirSync(pkg)
    fs.mkdirSync(project)
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    for (const item of ['package.json', ...manifest.files]) {
      const from = path.join(ROOT, item)
      if (fs.existsSync(from)) fs.cpSync(from, path.join(pkg, item), { recursive: true })
    }
    fs.writeFileSync(path.join(pkg, 'agents/godkit-explorer.md'), 'invalid agent')
    const out = spawnSync(process.execPath, [path.join(pkg, 'bin/godkit.js'), 'init', '--no-install', '--no-githook'], { cwd: project, encoding: 'utf8' })
    assert.equal(out.status, 1)
    assert.match(out.stdout, /agents: no frontmatter/)
    assert.match(out.stdout, /Configuration incomplete/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('init migrates existing bare-node hooks even when script paths already point at this package', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit migrate runtime '))
  try {
    const hooks = require('../lib/install')
    const configDir = path.join(dir, 'claude')
    const project = path.join(dir, 'project')
    fs.mkdirSync(configDir)
    fs.mkdirSync(project)
    const current = hooks.applyHooks({}, { hooksDir: path.join(ROOT, 'hooks') }).settings
    for (const handler of hooks.ourHandlers(current, 'claude')) handler.command = handler.command.replace(/^"[^"]+" /, 'node ')
    fs.writeFileSync(path.join(configDir, 'settings.json'), JSON.stringify(current))
    const env = { ...process.env, HOME: dir, USERPROFILE: dir, CLAUDE_CONFIG_DIR: configDir, CODEX_HOME: path.join(dir, 'codex'), CURSOR_HOME: path.join(dir, 'cursor'), GEMINI_HOME: path.join(dir, 'gemini'), GODKIT_HOME: path.join(dir, 'godkit'), GODKIT_NO_CLAUDE_CLI: '1', GODKIT_FORCE_STABLE: '0' }
    const out = spawnSync(process.execPath, [BIN, 'init', '--no-mcp', '--no-githook'], { cwd: project, encoding: 'utf8', env })
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const written = JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8'))
    assert.ok(hooks.ourHandlers(written, 'claude').every((h) => !h.command.startsWith('node ')))
    assert.equal(hooks.ourHandlers(written, 'claude').length, hooks.HOOKS.length)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('failed release setup restores a real installOne migration from an owned legacy junction', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit rollback legacy '))
  try {
    const install = require('../lib/install')
    const releases = require('../lib/releases')
    const home = path.join(dir, 'home')
    const src = path.join(dir, 'skill')
    const dest = path.join(dir, 'installed')
    fs.mkdirSync(src)
    fs.writeFileSync(path.join(src, 'SKILL.md'), 'original skill')
    fs.symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir')
    const staged = releases.stageRelease(ROOT, { home })
    assert.throws(() => releases.activateRelease(staged, { home, configFiles: [dest], configure: () => {
      const result = install.installOne(src, dest, false, { copy: true })
      assert.equal(result.ok, true, result.reason)
      assert.equal(fs.lstatSync(dest).isSymbolicLink(), false)
      throw new Error('deliberate configuration failure')
    } }), /deliberate configuration failure/)
    assert.equal(fs.lstatSync(dest).isSymbolicLink(), true)
    assert.equal(fs.readFileSync(path.join(src, 'SKILL.md'), 'utf8'), 'original skill')
    assert.equal(releases.readState(home).current, null)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('uninstall removes owned machine registration and launcher while preserving foreign config and project memory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit uninstall Việt '))
  try {
    const project = path.join(dir, 'project')
    const codex = path.join(dir, '.codex')
    const home = path.join(dir, 'godkit')
    fs.mkdirSync(project)
    fs.mkdirSync(codex)
    fs.writeFileSync(path.join(codex, 'config.toml'), '[mcp_servers.foreign]\ncommand = "keep-me"\n')
    fs.writeFileSync(path.join(codex, 'hooks.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'foreign-hook' }] }] } }))
    const env = { ...process.env, HOME: dir, USERPROFILE: dir, CLAUDE_CONFIG_DIR: path.join(dir, '.claude'), CODEX_HOME: codex, CURSOR_HOME: path.join(dir, '.cursor'), GEMINI_HOME: path.join(dir, '.gemini'), GODKIT_HOME: home, GODKIT_NO_CLAUDE_CLI: '1', GODKIT_FORCE_STABLE: '0' }
    const setup = spawnSync(process.execPath, [BIN, 'init', '--no-githook'], { cwd: project, encoding: 'utf8', env })
    assert.equal(setup.status, 0, setup.stderr)
    fs.mkdirSync(path.join(home, 'bin'), { recursive: true })
    fs.writeFileSync(path.join(home, 'bin/godkit.cmd'), 'rem godkit-owned launcher\n')
    const result = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: project, encoding: 'utf8', env })
    assert.equal(result.status, 0, result.stderr)
    const hooks = fs.readFileSync(path.join(codex, 'hooks.json'), 'utf8')
    assert.ok(hooks.includes('foreign-hook'))
    assert.ok(!hooks.includes('hooks/brief.js') && !hooks.includes('hooks\\\\brief.js'))
    const mcp = fs.readFileSync(path.join(codex, 'config.toml'), 'utf8')
    assert.ok(mcp.includes('[mcp_servers.foreign]'))
    assert.ok(!mcp.includes('[mcp_servers.godkit]'))
    assert.ok(fs.existsSync(path.join(project, '.agent/BOARD.md')))
    assert.ok(!fs.existsSync(path.join(home, 'bin/godkit.cmd')))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
