'use strict'
// The idempotency the README promises. These run against a settings file, never the real one.
//
// The bug these exist for: identifying our own entries by the package name matched nothing,
// because the directory godkit is installed into is arbitrary — so every re-run appended a
// duplicate instead of replacing, and uninstall removed nothing.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const INSTALL = path.join(ROOT, 'hooks', 'install.js')

function settingsFile(contents) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-hookinst-'))
  const f = path.join(d, 'settings.json')
  if (contents !== undefined) fs.writeFileSync(f, contents)
  return f
}

const run = (file, args) =>
  execFileSync(process.execPath, [INSTALL, file, ...(args || [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

function ourEntries(file) {
  const s = JSON.parse(fs.readFileSync(file, 'utf8'))
  const out = []
  for (const [event, groups] of Object.entries(s.hooks || {})) {
    for (const g of groups) {
      for (const h of g.hooks || []) {
        if (/hooks[/\\](brief|clockout|map-watch)\.js/.test(h.command)) out.push(event)
      }
    }
  }
  return out.sort()
}

test('install registers the three hooks', () => {
  const f = settingsFile()
  run(f)
  assert.deepEqual(ourEntries(f), ['PostToolUse', 'SessionStart', 'Stop'])
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('installing twice does not duplicate', () => {
  // This is the one that failed: three entries became six.
  const f = settingsFile()
  run(f)
  run(f)
  run(f)
  assert.equal(ourEntries(f).length, 3, 're-running install must replace, not append')
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('install leaves other tools hooks alone', () => {
  const f = settingsFile(
    JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'some-other-tool --stop' }] }],
        PreToolUse: [{ hooks: [{ type: 'command', command: 'unrelated' }] }],
      },
    }),
  )
  run(f)
  const s = JSON.parse(fs.readFileSync(f, 'utf8'))
  const all = JSON.stringify(s.hooks)
  assert.ok(all.includes('some-other-tool --stop'), 'another tool Stop hook survived')
  assert.ok(all.includes('unrelated'), 'an event we do not touch survived')
  assert.equal(ourEntries(f).length, 3)
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('uninstall removes ours and keeps theirs', () => {
  const f = settingsFile(
    JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'some-other-tool --stop' }] }] } }),
  )
  run(f)
  run(f, ['--uninstall'])

  assert.equal(ourEntries(f).length, 0, 'ours are gone')
  assert.ok(JSON.stringify(JSON.parse(fs.readFileSync(f, 'utf8')).hooks).includes('some-other-tool'), 'theirs remain')
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('install refuses to rewrite a settings file it cannot parse', () => {
  const f = settingsFile('{ not valid json')
  assert.throws(() => run(f), /Could not parse|not valid/i)
  assert.equal(fs.readFileSync(f, 'utf8'), '{ not valid json', 'the file is left exactly as it was')
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('install writes a backup before changing an existing file', () => {
  const f = settingsFile(JSON.stringify({ hooks: {} }))
  run(f)
  assert.ok(fs.existsSync(f + '.bak'))
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('the uninstall script matches the same hook scripts install writes', () => {
  // Two files must agree on what "ours" means; drift there means uninstall silently misses.
  const installSrc = fs.readFileSync(INSTALL, 'utf8')
  const uninstallSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'uninstall.js'), 'utf8')
  for (const script of ['brief.js', 'clockout.js', 'map-watch.js']) {
    assert.ok(installSrc.includes(script), 'install.js knows ' + script)
    assert.ok(uninstallSrc.includes(script), 'uninstall.js knows ' + script)
  }
})
