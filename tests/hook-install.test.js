'use strict'
// The idempotency the README promises, and the ownership rule that keeps an uninstall from taking
// something it did not install.
//
// The bugs these exist for: identifying our own entries by the package name matched nothing,
// because the directory godkit is installed into is arbitrary — so every re-run appended a
// duplicate and uninstall removed nothing; and filtering whole GROUPS took a user's own hook with
// ours when they shared a group.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const INSTALL = path.join(ROOT, 'hooks', 'install.js')
const install = require('../lib/install')

function tmpdir(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  return fs.realpathSync.native(d)
}

function settingsFile(contents) {
  const f = path.join(tmpdir('godkit-hookinst-'), 'settings.json')
  if (contents !== undefined) fs.writeFileSync(f, contents)
  return f
}

const run = (file, args) =>
  execFileSync(process.execPath, [INSTALL, file, ...(args || [])], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// Every handler of ours, as "event script", so a count is meaningful and duplicates are visible.
function ourEntries(file) {
  const out = []
  for (const [event, groups] of Object.entries(read(file).hooks || {})) {
    for (const group of groups) {
      for (const handler of group.hooks || []) {
        if (install.isOurHandler(handler)) out.push(event + ' ' + handler.command)
      }
    }
  }
  return out
}

// --- hook registration ----------------------------------------------------------------------

test('install registers every hook in the list, once each', () => {
  const f = settingsFile()
  run(f)
  assert.equal(ourEntries(f).length, install.HOOKS.length)
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('the work-track lifecycle is registered, or clockout can never fire', () => {
  // clockout blocks on recorded session work; nothing records it unless these run.
  const f = settingsFile()
  run(f)
  const commands = ourEntries(f).join('\n')
  for (const mode of ['pre', 'post', 'edit', 'end']) {
    assert.match(commands, new RegExp('work-track\\.js" ' + mode), 'work-track ' + mode + ' is registered')
  }
  assert.match(commands, /^PreToolUse .*work-track/m)
  assert.match(commands, /^SessionEnd .*work-track/m)
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('installing three times does not duplicate', () => {
  // This is the one that failed: every re-run appended instead of replacing.
  const f = settingsFile()
  run(f)
  run(f)
  run(f)
  assert.equal(ourEntries(f).length, install.HOOKS.length, 're-running install must replace, not append')
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('install leaves other tools hooks alone', () => {
  const f = settingsFile(
    JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'some-other-tool --stop' }] }],
        PreCompact: [{ hooks: [{ type: 'command', command: 'unrelated' }] }],
      },
      permissions: { allow: ['Bash(ls:*)'] },
    }),
  )
  run(f)
  const settings = read(f)
  const all = JSON.stringify(settings.hooks)
  assert.ok(all.includes('some-other-tool --stop'), 'another tool Stop hook survived')
  assert.ok(all.includes('unrelated'), 'an event we do not touch survived')
  assert.deepEqual(settings.permissions, { allow: ['Bash(ls:*)'] }, 'unrelated settings survived')
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('a foreign hook sharing a group with ours is not swept out with it', () => {
  const f = settingsFile()
  run(f)
  const settings = read(f)
  // Simulate a user adding their own handler into the group our Stop hook lives in.
  settings.hooks.Stop[0].hooks.push({ type: 'command', command: 'their-audit --stop' })
  fs.writeFileSync(f, JSON.stringify(settings, null, 2))

  run(f, ['--uninstall'])
  const after = JSON.stringify(read(f).hooks)
  assert.ok(after.includes('their-audit --stop'), 'their handler survived our uninstall')
  assert.equal(ourEntries(f).length, 0, 'ours are gone')
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('uninstall removes ours and keeps theirs', () => {
  const f = settingsFile(
    JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'some-other-tool --stop' }] }] } }),
  )
  run(f)
  run(f, ['--uninstall'])

  assert.equal(ourEntries(f).length, 0, 'ours are gone')
  assert.ok(JSON.stringify(read(f).hooks).includes('some-other-tool'), 'theirs remain')
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('install refuses to rewrite a settings file it cannot parse', () => {
  const f = settingsFile('{ not valid json')
  assert.throws(() => run(f), /could not parse|not valid/i)
  assert.equal(fs.readFileSync(f, 'utf8'), '{ not valid json', 'the file is left exactly as it was')
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('install refuses a settings file that is not a JSON object', () => {
  const f = settingsFile('[1, 2, 3]')
  assert.throws(() => run(f), /JSON object/i)
  assert.equal(fs.readFileSync(f, 'utf8'), '[1, 2, 3]')
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('install writes a backup before changing an existing file', () => {
  const before = JSON.stringify({ hooks: {} })
  const f = settingsFile(before)
  run(f)
  assert.equal(fs.readFileSync(f + '.bak', 'utf8'), before)
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('--dry-run reports without touching the file', () => {
  const before = JSON.stringify({ hooks: {} })
  const f = settingsFile(before)
  const out = run(f, ['--dry-run'])
  assert.match(out, /Would have installed/)
  assert.equal(fs.readFileSync(f, 'utf8'), before, 'nothing was written')
  assert.ok(!fs.existsSync(f + '.bak'), 'no backup either')
  fs.rmSync(path.dirname(f), { recursive: true, force: true })
})

test('applyHooks never mutates the settings it was given', () => {
  const original = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'theirs' }] }] } }
  const snapshot = JSON.stringify(original)
  install.applyHooks(original, { uninstall: false, hooksDir: path.join(ROOT, 'hooks') })
  assert.equal(JSON.stringify(original), snapshot)
})

test('the plugin manifest and the installer agree on every hook', () => {
  // Two registration paths, one list. Drift means a hook runs under Claude and not under Codex.
  const generated = require('../scripts/sync-hooks').build()
  const onDisk = fs.readFileSync(path.join(ROOT, 'hooks', 'godkit-hooks.json'), 'utf8')
  assert.equal(onDisk, generated, 'run `node scripts/sync-hooks.js` and commit the result')
})

test('every registered hook script exists in the package', () => {
  for (const script of install.HOOK_SCRIPTS) {
    assert.ok(fs.existsSync(path.join(ROOT, 'hooks', script)), script + ' is missing')
  }
})

// --- skill ownership ------------------------------------------------------------------------

test('a directory we did not install is never replaced or removed', () => {
  const base = tmpdir('godkit-skills-')
  const src = path.join(ROOT, 'skills', 'godkit')
  const dest = path.join(base, 'godkit')
  fs.mkdirSync(dest, { recursive: true })
  fs.writeFileSync(path.join(dest, 'SKILL.md'), 'a skill the user wrote\n')

  assert.equal(install.ownership(dest, src), 'foreign')
  assert.equal(install.installOne(src, dest).how, 'refused')
  assert.equal(install.removeOne(dest, src).how, 'kept')
  assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8'), 'a skill the user wrote\n')
  fs.rmSync(base, { recursive: true, force: true })
})

test('what we installed is ours to replace and to remove', () => {
  const base = tmpdir('godkit-skills-')
  const src = path.join(ROOT, 'skills', 'godkit')
  const dest = path.join(base, 'godkit')

  const first = install.installOne(src, dest)
  assert.ok(first.ok, first.reason)
  assert.ok(['linked', 'copied'].includes(first.how))
  assert.ok(fs.existsSync(path.join(dest, 'SKILL.md')), 'the skill is readable at the destination')
  assert.ok(install.ownership(dest, src).startsWith('ours'))

  assert.ok(install.installOne(src, dest).ok, 're-installing over our own is fine')
  assert.equal(install.removeOne(dest, src).how, 'removed')
  assert.ok(!fs.existsSync(dest))
  fs.rmSync(base, { recursive: true, force: true })
})

test('a plain file in the way is foreign, not something to overwrite', () => {
  const base = tmpdir('godkit-skills-')
  const dest = path.join(base, 'godkit')
  fs.writeFileSync(dest, 'not a directory\n')
  assert.equal(install.ownership(dest, path.join(ROOT, 'skills', 'godkit')), 'foreign')
  fs.rmSync(base, { recursive: true, force: true })
})

test('removing what is not there is not an error', () => {
  const base = tmpdir('godkit-skills-')
  assert.deepEqual(install.removeOne(path.join(base, 'nothing'), ROOT), { ok: true, how: 'absent' })
  fs.rmSync(base, { recursive: true, force: true })
})

test('--dry-run install and remove change nothing on disk', () => {
  const base = tmpdir('godkit-skills-')
  const src = path.join(ROOT, 'skills', 'godkit')
  const dest = path.join(base, 'godkit')

  assert.equal(install.installOne(src, dest, true).how, 'would install')
  assert.ok(!fs.existsSync(dest), 'dry-run install wrote nothing')

  install.installOne(src, dest)
  assert.equal(install.removeOne(dest, src, true).how, 'would remove')
  assert.ok(fs.existsSync(dest), 'dry-run remove deleted nothing')
  fs.rmSync(base, { recursive: true, force: true })
})

test('uninstall --dry-run touches nothing', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'uninstall.js'), '--dry-run'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CLAUDE_CONFIG_DIR: tmpdir('godkit-unin-'), CODEX_HOME: tmpdir('godkit-unin-') },
  })
  assert.ok(!/^removed /m.test(out), 'a dry run must not report removing anything')
})
