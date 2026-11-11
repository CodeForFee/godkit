'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const ROOT = path.resolve(__dirname, '..')

test('the actual release archive contains the runtime installers and runs in an isolated Unicode project', { timeout: 120000 }, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-artifact-'))
  const project = path.join(temp, 'project space-ทดสอบ')
  const home = path.join(temp, 'isolated home-ทดสอบ')
  fs.mkdirSync(project, { recursive: true }); fs.mkdirSync(home, { recursive: true })
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, 'config'), GODKIT_HOME: path.join(home, 'godkit'), GODKIT_NO_CLAUDE_CLI: '1' }
  const run = (exe, args, options = {}) => {
    const result = spawnSync(exe, args, { env, cwd: project, encoding: 'utf8', timeout: 90000, windowsHide: true, ...options })
    assert.equal(result.status, 0, (result.error && result.error.message) || result.stderr || result.stdout)
    return result.stdout
  }
  try {
    const packed = JSON.parse(run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], { cwd: ROOT, shell: process.platform === 'win32' }))[0]
    assert.ok(packed.size < 300 * 1024, 'compressed npm artifact exceeds the 300 KiB release budget')
    const names = packed.files.map((f) => f.path)
    for (const name of ['bin/bootstrap.js', 'scripts/install.ps1', 'scripts/install.sh', 'scripts/runtime-lock.json', 'lib/runtime.js', 'lib/releases.js', 'lib/doctor.js']) assert.ok(names.includes(name), 'release is missing ' + name)
    assert.ok(!names.some((name) => name.startsWith('node_modules/')), 'development dependencies must not ship')
    run('tar', ['-xzf', path.join(temp, packed.filename), '-C', temp])
    const installed = path.join(temp, 'package')
    const bin = path.join(installed, 'bin', 'godkit.js')
    assert.equal(run(process.execPath, [bin, '--version']).trim(), require('../package.json').version)
    run(process.execPath, [bin, 'init', '--no-install'])
    assert.ok(fs.existsSync(path.join(project, '.agent', 'BOARD.md')))
    assert.ok(fs.existsSync(path.join(project, '.codex', 'agents', 'godkit-reviewer.toml')))
    const messages = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'artifact-test', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ]
    const replies = run(process.execPath, [bin, 'mcp'], { input: messages.map((m) => JSON.stringify(m)).join('\n') + '\n' }).trim().split(/\r?\n/).map((line) => JSON.parse(line))
    assert.equal(replies[0].result.serverInfo.name, 'godkit')
    assert.ok(replies[1].result.tools.some((tool) => tool.name === 'godkit_log'))
    const lock = JSON.parse(fs.readFileSync(path.join(installed, 'scripts', 'runtime-lock.json'), 'utf8'))
    assert.equal(lock.godkitVersion, require('../package.json').version, 'installer release version must match package version')
    assert.equal(Number(lock.version.split('.')[0]), 24, 'downloaded runtime stays on the validated Node 24 line')
    assert.ok(fs.readFileSync(path.join(installed, 'scripts', 'install.sh'), 'utf8').includes('release=' + lock.godkitVersion), 'shell installer version drifted')
    assert.ok(fs.readFileSync(path.join(installed, 'scripts', 'install.ps1'), 'utf8').includes("$release = '" + lock.godkitVersion + "'"), 'PowerShell installer version drifted')
    for (const platform of ['win-x64', 'win-arm64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64']) assert.match(lock.archives[platform].sha256, /^[a-f0-9]{64}$/, platform + ' needs a pinned checksum')

    // Exercise the actual platform installer, with a local archive and explicit existing Node.
    // Runtime download/checksum fault scenarios belong to bootstrap.test.js; no network here.
    // Node 18 remains a legacy CLI test target; the bootstrap deliberately selects maintained LTS.
    if (![22, 24, 26].includes(Number(process.versions.node.split('.')[0]))) return
    const installerProject = path.join(temp, 'installer project-ทดสอบ')
    fs.mkdirSync(installerProject)
    if (process.platform === 'win32') {
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(installed, 'scripts', 'install.ps1'), '-Source', installed, '-Project', installerProject, '-HomeDirectory', path.join(home, 'installer'), '-RuntimeLock', path.join(installed, 'scripts', 'runtime-lock.json'), '-NodePath', process.execPath, '-ProjectOnly'])
    } else {
      run('sh', [path.join(installed, 'scripts', 'install.sh'), '--source', installed, '--project', installerProject, '--home', path.join(home, 'installer'), '--runtime-lock', path.join(installed, 'scripts', 'runtime-lock.json'), '--node', process.execPath, '--project-only'])
    }
    assert.ok(fs.existsSync(path.join(installerProject, '.agent', 'BOARD.md')), 'platform installer did not initialize the project')
    assert.ok(!fs.existsSync(path.join(home, '.codex', 'hooks.json')), 'project-only smoke must not configure machine hosts')

    // A release-downloaded script has no ../bin/bootstrap.js beside it. A local tarball must
    // bootstrap that payload without fetching a published package or reaching the network.
    const standalone = path.join(temp, 'standalone installer')
    const offlineProject = path.join(temp, 'offline project')
    fs.mkdirSync(standalone)
    fs.mkdirSync(offlineProject)
    const script = process.platform === 'win32' ? 'install.ps1' : 'install.sh'
    fs.copyFileSync(path.join(installed, 'scripts', script), path.join(standalone, script))
    fs.copyFileSync(path.join(installed, 'scripts/runtime-lock.json'), path.join(standalone, 'runtime-lock.json'))
    const archive = path.join(temp, packed.filename)
    const offlineEnv = { ...env, npm_config_offline: 'true' }
    if (process.platform === 'win32') {
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(standalone, script), '-Source', archive, '-Project', offlineProject, '-HomeDirectory', path.join(home, 'offline installer'), '-NodePath', process.execPath, '-ProjectOnly'], { env: offlineEnv })
    } else {
      run('sh', [path.join(standalone, script), '--source', archive, '--project', offlineProject, '--home', path.join(home, 'offline installer'), '--node', process.execPath, '--project-only'], { env: offlineEnv })
    }
    assert.ok(fs.existsSync(path.join(offlineProject, '.agent/BOARD.md')), 'standalone offline tarball setup did not finish')
  } finally { fs.rmSync(temp, { recursive: true, force: true }) }
})
