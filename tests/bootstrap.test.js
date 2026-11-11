'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { spawnSync, spawn } = require('node:child_process')
const crypto = require('node:crypto')
const { parse } = require('../bin/bootstrap')
const ROOT = path.resolve(__dirname, '..')
const BOOT = path.join(ROOT, 'bin', 'bootstrap.js')
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-bootstrap-'))
const environment = (base) => ({ ...process.env, HOME: base, USERPROFILE: base, GODKIT_HOME: path.join(base, 'home'), GODKIT_NO_CLAUDE_CLI: '1' })

function fixture(base, version) {
  const source = path.join(base, 'source-' + version)
  fs.mkdirSync(path.join(source, 'bin'), { recursive: true })
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: '@codeforfee/godkit', version, files: ['bin/'] }))
  fs.writeFileSync(path.join(source, 'bin', 'godkit.js'), `
if(process.argv[2]==='--version') console.log(${JSON.stringify(version)})
else if(process.argv[2]==='mcp') {let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{for(const l of b.trim().split('\\n')){const m=JSON.parse(l);if(m.id)console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:m.method==='initialize'?{serverInfo:{name:'godkit'}}:{tools:[{name:'x'}]}}))}})}
else if(process.argv[2]==='init') {if(process.env.GODKIT_TEST_CONFIG_FAIL)process.exit(1);const fs=require('fs');fs.mkdirSync(process.argv[3],{recursive:true});fs.writeFileSync(require('path').join(process.argv[3],'configured.txt'),${JSON.stringify(version)})}
`)
  return source
}

test('bootstrap arguments are explicit and missing values are rejected', () => {
  assert.equal(parse(['--project-only', '--rollback']).rollback, true)
  assert.throws(() => parse(['--source']), /missing value/)
  assert.throws(() => parse(['--unknown']), /unknown/)
})

test('bootstrap uses local package, absolute launchers, and rolls back failed upgrade', () => {
  const base = temporary()
  try {
    const env = environment(base)
    const project = path.join(base, 'project ü spaced')
    const run = (source, extraEnv) => spawnSync(process.execPath, [BOOT, '--source', source, '--home', env.GODKIT_HOME, '--project', project, '--project-only'], { encoding: 'utf8', env: { ...env, ...extraEnv }, timeout: 30000 })
    const a = fixture(base, '1.0.0')
    const result = run(a)
    assert.equal(result.status, 0, result.stderr)
    const before = fs.readFileSync(path.join(env.GODKIT_HOME, 'active.json'), 'utf8')
    assert.match(fs.readFileSync(path.join(env.GODKIT_HOME, 'bin', 'godkit.cmd'), 'utf8'), new RegExp(process.execPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    const fail = run(fixture(base, '1.1.0'), { GODKIT_TEST_CONFIG_FAIL: '1' })
    assert.equal(fail.status, 1)
    assert.equal(fs.readFileSync(path.join(env.GODKIT_HOME, 'active.json'), 'utf8'), before)
    assert.equal(fs.readFileSync(path.join(project, 'configured.txt'), 'utf8'), '1.0.0')
    assert.equal(fs.readdirSync(env.GODKIT_HOME).some((p) => p.startsWith('.download-')), false)
  } finally { fs.rmSync(base, { recursive: true, force: true }) }
})

test('platform installer reuses existing Node and installs from local source', { skip: ![22, 24, 26].includes(Number(process.versions.node.split('.')[0])) }, () => {
  const base = temporary()
  try {
    const env = environment(base)
    const source = fixture(base, '1.0.0')
    const project = path.join(base, 'project spaced ü')
    const windows = process.platform === 'win32'
    const command = windows ? 'powershell.exe' : 'sh'
    const args = windows
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'install.ps1'), '-Source', source, '-Project', project, '-HomeDirectory', env.GODKIT_HOME, '-NodePath', process.execPath, '-ProjectOnly']
      : [path.join(ROOT, 'scripts', 'install.sh'), '--source', source, '--project', project, '--home', env.GODKIT_HOME, '--node', process.execPath, '--project-only']
    const run = spawnSync(command, args, { env, encoding: 'utf8', timeout: 30000 })
    assert.equal(run.status, 0, run.stderr || String(run.error))
    assert.equal(fs.readFileSync(path.join(project, 'configured.txt'), 'utf8'), '1.0.0')
  } finally { fs.rmSync(base, { recursive: true, force: true }) }
})

test('runtime checksum mismatch leaves the active release and existing runtime untouched', () => {
  const base = temporary()
  try {
    const env = environment(base)
    const home = env.GODKIT_HOME
    fs.mkdirSync(home, { recursive: true })
    fs.writeFileSync(path.join(home, 'active.json'), 'prior release')
    const windows = process.platform === 'win32'
    const platform = windows ? 'win' : process.platform
    const arch = process.arch
    const name = 'node-v24.22.2-' + platform + '-' + arch + (windows ? '.zip' : '.tar.gz')
    fs.writeFileSync(path.join(base, name), 'interrupted or corrupt archive')
    const lock = path.join(base, 'lock.json')
    fs.writeFileSync(lock, JSON.stringify({ godkitVersion: '1.1.0', version: '24.22.2', baseUrl: pathToFileURL(base + path.sep).href.replace(/\/$/, ''), archives: { [platform + '-' + arch]: { file: name, sha256: '0'.repeat(64) } } }))
    const args = windows
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'install.ps1'), '-Source', fixture(base, '1.0.0'), '-HomeDirectory', home, '-RuntimeLock', lock, '-ForceRuntime', '-ProjectOnly']
      : [path.join(ROOT, 'scripts', 'install.sh'), '--source', fixture(base, '1.0.0'), '--home', home, '--runtime-lock', lock, '--force-runtime', '--project-only']
    const run = spawnSync(windows ? 'powershell.exe' : 'sh', args, { env, encoding: 'utf8', timeout: 30000 })
    assert.notEqual(run.status, 0)
    assert.match(run.stderr, /checksum mismatch/)
    assert.equal(fs.readFileSync(path.join(home, 'active.json'), 'utf8'), 'prior release')
    assert.equal(fs.existsSync(path.join(home, 'runtime')), false)
  } finally { fs.rmSync(base, { recursive: true, force: true }) }
})

const posixShell = process.platform === 'win32'
  ? [path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git', 'bin', 'sh.exe'), 'C:/Program Files/Git/usr/bin/sh.exe'].find((file) => fs.existsSync(file))
  : 'sh'
const shellPath = (file) => process.platform === 'win32' ? file.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase()) : file
// Git for Windows prepends its own tools at shell startup; set the fixture PATH afterwards.
const posixArgs = (args) => ['-c', 'PATH=$GODKIT_TEST_PATH; export PATH; . "$0"', ...args]

function posixFixture(base, options) {
  const o = options || {}
  const env = environment(base)
  const home = env.GODKIT_HOME
  const tools = path.join(base, 'tools')
  fs.mkdirSync(tools)
  const script = (name, body) => {
    const file = path.join(tools, name)
    fs.writeFileSync(file, '#!/bin/sh\n' + body + '\n', { mode: 0o755 })
    return file
  }
  script('uname', 'case "$1" in -s) echo Linux;; -m) echo x86_64;; *) exit 1;; esac')
  for (const name of ['curl', 'wget', 'tar']) script(name, 'echo called >> "$HOME/unexpected-runtime-io"; exit 89')
  const lock = path.join(base, 'lock.json')
  const version = o.version === undefined ? '24.22.2' : o.version
  const archive = o.archive === undefined ? 'node-v24.22.2-linux-x64.tar.gz' : o.archive
  let serializedLock = JSON.stringify({ godkitVersion: '1.1.0', version, baseUrl: 'http://127.0.0.1:9/no-network', archives: { 'linux-x64': { file: archive, sha256: o.sha256 || '0'.repeat(64) } } })
  if (o.rawControl) serializedLock = serializedLock.replace('\\n', '\n')
  fs.writeFileSync(lock, serializedLock)
  const args = [shellPath(path.join(ROOT, 'scripts', 'install.sh')), '--source', shellPath(fixture(base, '1.0.0')), '--project', shellPath(path.join(base, 'project')), '--home', shellPath(home), '--runtime-lock', shellPath(lock), '--force-runtime', '--project-only']
  const inheritedPath = env.PATH || env.Path || ''
  env.PATH = [shellPath(tools), '/usr/bin', '/bin', ...inheritedPath.split(path.delimiter).filter(Boolean).map(shellPath)].join(':')
  env.GODKIT_TEST_PATH = env.PATH
  delete env.Path
  env.HOME = shellPath(base)
  env.GODKIT_HOME = shellPath(home)
  return { home, tools, env, args, script, marker: path.join(base, 'unexpected-runtime-io'), runtime: path.join(home, 'runtime', '24.22.2-linux-x64') }
}

test('POSIX runtime lock rejects traversal and control characters before download/extraction', { skip: !posixShell }, () => {
  const malformed = [
    { version: '24.22.2/../../escape' }, { version: '24.22.2suffix' }, { version: '24.22.2\t' }, { version: '24.22.2\n' }, { version: '24.\n22.2', rawControl: true },
    { archive: 'node-v24.22.2/../../escape-linux-x64.tar.gz' }, { archive: '../node-v24.22.2-linux-x64.tar.gz' },
    { archive: 'node-v24.22.2-linux-x64.tar.gz\t' },
  ]
  for (const values of malformed) {
    const base = temporary()
    try {
      const f = posixFixture(base, values)
      const run = spawnSync(posixShell, posixArgs(f.args), { env: f.env, encoding: 'utf8', timeout: 10000 })
      assert.notEqual(run.status, 0, JSON.stringify(values))
      assert.match(run.stderr, /lock must pin an exact|runtime archive missing\/invalid/, run.stderr)
      assert.equal(fs.existsSync(f.marker), false, 'malformed data must fail before runtime IO')
      assert.equal(fs.existsSync(path.join(f.home, 'runtime')), false)
    } finally { fs.rmSync(base, { recursive: true, force: true }) }
  }
})

test('POSIX private runtime reuse requires the exact pin and preserves damaged caches', { skip: !posixShell }, () => {
  for (const actualVersion of ['v24.22.2', 'v24.0.0', 'v22.0.0']) {
    const base = temporary()
    try {
      const f = posixFixture(base)
      const bin = path.join(f.runtime, 'bin')
      fs.mkdirSync(bin, { recursive: true })
      const node = path.join(bin, 'node')
      fs.writeFileSync(node, '#!/bin/sh\nif [ "$1" = --version ]; then echo ' + actualVersion + '; else echo reused > "$HOME/runtime-used"; fi\n', { mode: 0o755 })
      const original = fs.readFileSync(node)
      const run = spawnSync(posixShell, posixArgs(f.args), { env: f.env, encoding: 'utf8', timeout: 10000 })
      if (actualVersion === 'v24.22.2') {
        assert.equal(run.status, 0, run.stderr)
        assert.equal(fs.existsSync(path.join(base, 'runtime-used')), true)
      } else {
        assert.notEqual(run.status, 0)
        assert.match(run.stderr, /existing runtime damaged or differs from pin/)
      }
      assert.deepEqual(fs.readFileSync(node), original, 'an existing cache is never overwritten')
      assert.equal(fs.existsSync(f.marker), false, 'reuse/refusal must not download or extract')
    } finally { fs.rmSync(base, { recursive: true, force: true }) }
  }
})

test('POSIX runtime lock prevents concurrent installers from nesting a completed cache', { skip: !posixShell }, async () => {
  const base = temporary()
  let child
  try {
    const f = posixFixture(base)
    const packageRoot = path.join(base, 'archive-source', 'node-v24.22.2-linux-x64')
    fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true })
    fs.writeFileSync(path.join(packageRoot, 'bin', 'node'), '#!/bin/sh\nif [ "$1" = --version ]; then echo v24.22.2; else echo ready > "$HOME/runtime-used"; fi\n', { mode: 0o755 })
    const archive = path.join(base, 'runtime.tar.gz')
    const packed = spawnSync(posixShell, ['-c', 'tar -czf "$1" -C "$2" "$3"', '--', shellPath(archive), shellPath(path.dirname(packageRoot)), path.basename(packageRoot)], { encoding: 'utf8', timeout: 10000 })
    assert.equal(packed.status, 0, packed.stderr)
    const lockPath = path.join(base, 'lock.json')
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    lock.archives['linux-x64'].sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
    fs.writeFileSync(lockPath, JSON.stringify(lock))
    fs.rmSync(path.join(f.tools, 'tar'))
    f.script('curl', 'for arg do output=$arg; done\necho started > "$HOME/download-started"\nsleep 1\ncp "$RUNTIME_ARCHIVE" "$output"')
    f.env.RUNTIME_ARCHIVE = shellPath(archive)
    child = spawn(posixShell, posixArgs(f.args), { env: f.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (c) => { stderr += c })
    child.stdout.resume()
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
    for (let i = 0; i < 100 && !fs.existsSync(path.join(base, 'download-started')); i++) await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(fs.existsSync(path.join(base, 'download-started')), true, stderr)
    const second = spawnSync(posixShell, posixArgs(f.args), { env: f.env, encoding: 'utf8', timeout: 10000 })
    assert.notEqual(second.status, 0)
    assert.match(second.stderr, /installation already in progress/)
    assert.equal(await done, 0, stderr)
    child = null
    assert.equal(fs.existsSync(path.join(f.runtime, 'bin', 'node')), true)
    assert.equal(fs.existsSync(path.join(f.runtime, 'runtime')), false, 'mv must never nest the runtime directory')
    assert.equal(fs.existsSync(path.join(path.dirname(f.runtime), '.install-24.22.2-linux-x64.lock')), false)
  } finally {
    if (child && child.exitCode === null) { child.kill(); await new Promise((resolve) => child.once('close', resolve)) }
    fs.rmSync(base, { recursive: true, force: true })
  }
})
