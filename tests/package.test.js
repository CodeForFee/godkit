'use strict'
// Contract tests: the package ships what the README promises, the manifests agree, and the
// generated files are not stale. These catch the failures that unit tests never see — a skill
// left out of `files`, a version bumped in three places out of four.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const json = (rel) => JSON.parse(read(rel))

const pkg = json('package.json')

test('the package ships everything the skills and hooks need at runtime', () => {
  // A path missing from `files` is invisible until someone installs from npm and it 404s.
  for (const needed of ['bin/', 'lib/', 'skills/', 'agents/', 'hooks/', 'templates/', 'AGENTS.md']) {
    assert.ok(pkg.files.includes(needed), needed + ' must be in the files allowlist')
  }
})

test('the bin entry exists and is executable as a script', () => {
  const bin = pkg.bin.godkit
  assert.ok(fs.existsSync(path.join(ROOT, bin)), bin + ' is missing')
  assert.match(read(bin), /^#!\/usr\/bin\/env node/, 'needs a shebang to run as a CLI')
})

test('the package declares no runtime dependencies', () => {
  // The whole install story depends on this: no install step, nothing to audit, nothing to break.
  assert.equal(pkg.dependencies, undefined)
  assert.equal(pkg.devDependencies, undefined)
})

test('every skill directory has a SKILL.md whose name matches the directory', () => {
  const dirs = fs
    .readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  assert.ok(dirs.length >= 9, 'expected the full skill set, found ' + dirs.length)

  for (const dir of dirs) {
    const file = path.join('skills', dir, 'SKILL.md')
    assert.ok(fs.existsSync(path.join(ROOT, file)), file + ' is missing')
    const body = read(file)
    const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    assert.ok(m, dir + ': needs YAML frontmatter')
    const name = m[1].match(/^name:\s*(\S+)/m)
    assert.ok(name, dir + ': frontmatter needs a name')
    assert.equal(name[1], dir, dir + ': frontmatter name must match its directory')
    assert.match(m[1], /^description:/m, dir + ': frontmatter needs a description')
  }
})

test('every skill states what it does not do', () => {
  // Without a boundary the model reaches for the wrong skill; this is the line that stops it.
  const dirs = fs
    .readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
  for (const dir of dirs) {
    assert.match(read(path.join('skills', dir, 'SKILL.md')), /## Boundaries/, dir + ': no Boundaries section')
  }
})

test('every agent prompt has frontmatter with a matching name', () => {
  for (const file of fs.readdirSync(path.join(ROOT, 'agents')).filter((f) => f.endsWith('.md'))) {
    const body = read(path.join('agents', file))
    const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    assert.ok(m, file + ': needs frontmatter')
    const name = m[1].match(/^name:\s*(\S+)/m)
    assert.ok(name, file + ': frontmatter needs a name')
    assert.equal(name[1], path.basename(file, '.md'), file + ': name must match the filename')
  }
})

test('every slash command maps to a skill that exists', () => {
  // A command naming a skill that is not there fails silently at the worst moment.
  const cmds = fs.readdirSync(path.join(ROOT, 'commands')).filter((f) => f.endsWith('.toml'))
  const skills = fs
    .readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  assert.equal(cmds.length, skills.length, 'one command per skill')
  for (const c of cmds) {
    const name = path.basename(c, '.toml')
    assert.ok(skills.includes(name), 'command ' + c + ' has no matching skill')
    const body = read(path.join('commands', c))
    assert.match(body, /^description = /m, c + ': needs a description')
    assert.match(body, /^prompt = /m, c + ': needs a prompt')
  }
})

test('all version-bearing manifests agree', () => {
  const versions = [
    pkg.version,
    json('.claude-plugin/plugin.json').version,
    json('.codex-plugin/plugin.json').version,
    json('gemini-extension.json').version,
  ]
  assert.equal(new Set(versions).size, 1, 'version drift: ' + versions.join(', '))
})

test('the marketplace manifest carries no version, which its schema rejects', () => {
  assert.equal(json('.claude-plugin/marketplace.json').version, undefined)
})

test('the hook config points at hook files that exist', () => {
  const hooks = json('hooks/godkit-hooks.json').hooks
  const events = Object.keys(hooks)
  assert.deepEqual(events.sort(), ['PostToolUse', 'SessionStart', 'Stop'])

  for (const groups of Object.values(hooks)) {
    for (const group of groups) {
      for (const h of group.hooks) {
        const m = h.command.match(/hooks\/([\w-]+\.js)/)
        assert.ok(m, 'hook command must name a script: ' + h.command)
        assert.ok(fs.existsSync(path.join(ROOT, 'hooks', m[1])), m[1] + ' is missing')
      }
    }
  }
})

test('the generated rule copies are in sync with AGENTS.md', () => {
  const body = read('AGENTS.md')
  assert.equal(read('CLAUDE.md'), body, 'CLAUDE.md drifted — run scripts/sync-rules.js')
  assert.equal(read('.agents/rules/godkit.md'), body, 'antigravity rules drifted')
  assert.equal(read('.github/copilot-instructions.md'), body, 'copilot instructions drifted')

  const cursor = read('.cursor/rules/godkit.mdc')
  assert.ok(cursor.startsWith('---'), 'cursor rules need .mdc frontmatter')
  assert.match(cursor, /alwaysApply: true/, 'cursor rules must always apply')
  assert.ok(cursor.endsWith(body), 'cursor rules must carry the AGENTS.md body verbatim')
})

test('the always-on rules keep the two non-negotiable instructions', () => {
  // These two sentences are the entire protocol; everything else is elaboration.
  const body = read('AGENTS.md')
  assert.match(body, /Read `\.agent\/` before you edit/)
  assert.match(body, /Write your log before you finish/)
})

test('nothing in the shipped package references the tools it was built alongside', () => {
  const banned = /ponytail|deepseek|understand-anything|cordis|agent-skills|addyosmani|taste-skill|leonxlnx/i
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'tests') continue
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(abs)
        continue
      }
      if (!/\.(md|js|json|mdc)$/.test(e.name)) continue
      const body = fs.readFileSync(abs, 'utf8')
      assert.ok(!banned.test(body), path.relative(ROOT, abs) + ' references an external project')
    }
  }
  walk(ROOT)
})
