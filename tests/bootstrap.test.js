'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { spawnSync } = require('node:child_process')
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
