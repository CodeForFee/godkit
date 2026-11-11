'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { stageRelease, activateRelease, rollbackRelease, readState } = require('../lib/releases')
const { recordWrite, recordLink } = require('../lib/install-journal')
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-release-'))

function fixture(dir, version, broken) {
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@codeforfee/godkit', version, files: ['bin/'] }))
  fs.writeFileSync(path.join(dir, 'bin', 'godkit.js'), broken ? 'process.exit(1)' : `
if (process.argv[2] === '--version') console.log(${JSON.stringify(version)})
else if (process.argv[2] === 'mcp') {
 let buffer = ''; process.stdin.on('data', c => buffer += c)
 process.stdin.on('end', () => { for (const line of buffer.trim().split('\\n')) { const m=JSON.parse(line); if (m.id) console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:m.method==='initialize'?{serverInfo:{name:'godkit'}}:{tools:[{name:'x'}]}})) } })
}
`)
  return dir
}

test('release staging is immutable, checked with real MCP, and keeps current plus one rollback', () => {
  const base = temp()
  try {
    const home = path.join(base, 'home ü spaced')
    const a = stageRelease(fixture(path.join(base, 'a'), '1.0.0'), { home })
    assert.deepEqual(stageRelease(path.join(base, 'a'), { home }), a)
    assert.equal(fs.existsSync(path.join(home, 'active.json')), false)
    activateRelease(a, { home })
    const b = stageRelease(fixture(path.join(base, 'b'), '1.1.0'), { home })
    assert.equal(activateRelease(b, { home }).previous.root, a.root)
    assert.equal(rollbackRelease({ home }).current.root, a.root)
    activateRelease(b, { home })
    const c = stageRelease(fixture(path.join(base, 'c'), '1.2.0'), { home })
    const state = activateRelease(c, { home })
    assert.equal(state.current.root, c.root)
    assert.equal(state.previous.root, b.root)
    assert.equal(fs.existsSync(a.root), false)
    assert.throws(() => stageRelease(fixture(path.join(base, 'bad'), '2.0.0', true), { home }), /version check/)
    assert.equal(readState(home).current.root, c.root)
  } finally { fs.rmSync(base, { recursive: true, force: true }) }
})

test('failed configuration restores files, added skill files, and active pointer', () => {
  const base = temp()
  try {
    const home = path.join(base, 'home')
    const a = stageRelease(fixture(path.join(base, 'a'), '1.0.0'), { home })
    activateRelease(a, { home })
    const b = stageRelease(fixture(path.join(base, 'b'), '1.1.0'), { home })
    const dir = path.join(base, 'config')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'mine.json'), 'original')
    const foreign = path.join(base, '.agent')
    fs.mkdirSync(foreign)
    fs.writeFileSync(path.join(foreign, 'memory.md'), 'keep')
    assert.throws(() => activateRelease(b, { home, configFiles: [dir], configure: () => {
      recordWrite(path.join(dir, 'mine.json'), Buffer.from('original'), Buffer.from('changed'))
      fs.writeFileSync(path.join(dir, 'mine.json'), 'changed')
      recordWrite(path.join(dir, 'new.json'), null, Buffer.from('added'))
      fs.writeFileSync(path.join(dir, 'new.json'), 'added')
      throw new Error('disk full')
    } }), /disk full/)
    assert.equal(fs.readFileSync(path.join(dir, 'mine.json'), 'utf8'), 'original')
    assert.equal(fs.existsSync(path.join(dir, 'new.json')), false)
    assert.equal(fs.readFileSync(path.join(foreign, 'memory.md'), 'utf8'), 'keep')
    assert.equal(readState(home).current.root, a.root)
  } finally { fs.rmSync(base, { recursive: true, force: true }) }
})

test('rollback preserves concurrent edits made during configuration, including unjournaled new files', () => {
  const base = temp()
  try {
    const home = path.join(base, 'home')
    const a = stageRelease(fixture(path.join(base, 'a'), '1.0.0'), { home })
    activateRelease(a, { home })
    const b = stageRelease(fixture(path.join(base, 'b'), '1.1.0'), { home })
    const dir = path.join(base, 'config')
    fs.mkdirSync(dir)
    const file = path.join(dir, 'user.json')
    fs.writeFileSync(file, 'initial')
    assert.throws(() => activateRelease(b, { home, configFiles: [dir], configure: () => {
      recordWrite(file, Buffer.from('initial'), Buffer.from('installer'))
      fs.writeFileSync(file, 'installer')
      fs.writeFileSync(file, 'concurrent editor')
      fs.writeFileSync(path.join(dir, 'new-user-file'), 'user created')
      throw new Error('setup failure')
    } }), /concurrently; preserved/)
    assert.equal(fs.readFileSync(file, 'utf8'), 'concurrent editor')
    assert.equal(fs.readFileSync(path.join(dir, 'new-user-file'), 'utf8'), 'user created')
    assert.equal(readState(home).current.root, a.root)
    assert.equal(fs.readdirSync(home).some((name) => name.startsWith('.install-journal-')), false)
  } finally { fs.rmSync(base, { recursive: true, force: true }) }
})

test('invalid allowlists and locked or foreign state are refused before activation', () => {
  const base = temp()
  try {
    const home = path.join(base, 'home')
    const source = fixture(path.join(base, 'source'), '1.0.0')
    const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json')))
    pkg.files.push('../outside')
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify(pkg))
    assert.throws(() => stageRelease(source, { home }), /unsafe/)
    pkg.files.pop()
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify(pkg))
    fs.mkdirSync(path.join(home, 'install.lock'), { recursive: true })
    assert.throws(() => stageRelease(source, { home }), /another Godkit/)
    fs.rmdirSync(path.join(home, 'install.lock'))
    const staged = stageRelease(source, { home })
    fs.writeFileSync(path.join(home, 'active.json'), '{"current":"foreign"}')
    assert.throws(() => activateRelease(staged, { home }), /not owned/)
    assert.throws(() => rollbackRelease({ home: path.join(base, 'empty') }), /no previous/)
  } finally { fs.rmSync(base, { recursive: true, force: true }) }
})

test('failed legacy linked-skill migration restores the link without touching its target', () => {
  const base = temp()
  try {
    const home = path.join(base, 'home')
    const staged = stageRelease(fixture(path.join(base, 'a'), '1.0.0'), { home })
    const old = path.join(base, 'old-source')
    fs.mkdirSync(old)
    fs.writeFileSync(path.join(old, 'SKILL.md'), 'original target')
    const dest = path.join(base, 'skill')
    fs.symlinkSync(old, dest, process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(() => activateRelease(staged, { home, configFiles: [dest], configure: () => {
      recordLink(dest, fs.readlinkSync(dest), null, process.platform === 'win32' ? 'junction' : 'dir')
      fs.unlinkSync(dest)
      fs.mkdirSync(path.join(dest, 'nested'), { recursive: true })
      const added = path.join(dest, 'nested', 'SKILL.md')
      recordWrite(added, null, Buffer.from('new skill'))
      fs.writeFileSync(added, 'new skill')
      throw new Error('simulated failure')
    } }), /simulated failure/)
    assert.equal(fs.lstatSync(dest).isSymbolicLink(), true)
    assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8'), 'original target')
    assert.equal(fs.readFileSync(path.join(old, 'SKILL.md'), 'utf8'), 'original target')
  } finally { fs.rmSync(base, { recursive: true, force: true }) }
})
