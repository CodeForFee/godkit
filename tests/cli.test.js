'use strict'
// What `godkit init` and `godkit save` do to files a user also owns, and what freshness reports
// when git cannot answer. Every one of these is a "silently wrong" failure mode: a rule file that
// never landed, a map node for a file that is gone, a stale map reported as current.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const CLI = path.join(ROOT, 'bin', 'godkit.js')
const managed = require('../lib/managed')
const freshness = require('../lib/freshness')

const trash = []
process.on('exit', () => {
  for (const dir of trash) fs.rmSync(dir, { recursive: true, force: true })
})

function repo(commit) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-cli-')))
  trash.push(dir)
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  fs.writeFileSync(path.join(dir, 'code.js'), 'const a = 1\n')
  if (commit !== false) {
    git('add', '-A')
    git('commit', '-qm', 'init')
  }
  return dir
}

// init writes rule files; leaving them uncommitted makes every later freshness check see a dirty
// tree, which is correct behaviour but not what these tests are measuring.
function commitAll(dir) {
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['commit', '-qm', 'scaffold'], { cwd: dir, stdio: 'ignore' })
}

const cli = (dir, ...args) =>
  execFileSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8')

// --- managed blocks -------------------------------------------------------------------------

test('a managed block replaces only itself', () => {
  const first = managed.applyBlock('# My rules\n\nDo not shout.\n', 'godkit body', 'html')
  assert.equal(first.action, 'appended')
  assert.match(first.text, /# My rules/)
  assert.match(first.text, /godkit body/)

  const second = managed.applyBlock(first.text, 'a different body', 'html')
  assert.equal(second.action, 'updated')
  assert.match(second.text, /# My rules/, 'the user text is still there')
  assert.match(second.text, /Do not shout\./)
  assert.ok(!second.text.includes('godkit body'), 'the old body is gone')
  assert.equal(managed.readBlock(second.text, 'html'), 'a different body')
})

test('an unchanged block is reported, not rewritten', () => {
  const once = managed.applyBlock(null, 'body', 'html')
  assert.equal(once.action, 'created')
  assert.equal(managed.applyBlock(once.text, 'body', 'html').action, 'unchanged')
})

test('hand-edited markers are refused rather than guessed at', () => {
  const doubled = managed.applyBlock(null, 'body', 'html').text.repeat(2)
  assert.throws(() => managed.applyBlock(doubled, 'body', 'html'), /malformed/)
  assert.throws(() => managed.applyBlock('<!-- godkit:start -->\nno end', 'body', 'html'), /malformed/)
  assert.throws(
    () => managed.applyBlock('<!-- godkit:end -->\nx\n<!-- godkit:start -->', 'body', 'html'),
    /precedes/,
  )
})

test('removing a block leaves the user text behind', () => {
  const text = managed.applyBlock('mine\n', 'ours', 'html').text
  assert.equal(managed.removeBlock(text, 'html').trim(), 'mine')
  assert.equal(managed.removeBlock('nothing of ours here', 'html'), null)
})

// --- init -----------------------------------------------------------------------------------

test('init writes the rules and the .agent scaffold', () => {
  const dir = repo()
  cli(dir, 'init')
  for (const rel of ['AGENTS.md', 'CLAUDE.md', '.cursor/rules/godkit.mdc', '.agents/rules/godkit.md']) {
    assert.match(read(dir, rel), /Read `\.agent\/` before you edit/, rel + ' carries the rules')
  }
  for (const rel of ['BOARD.md', 'THREAD.md', 'MAP.md', '.agentignore']) {
    assert.ok(fs.existsSync(path.join(dir, '.agent', rel)), '.agent/' + rel + ' did not land')
  }
  assert.ok(fs.existsSync(path.join(dir, '.agent', 'tasks')), 'tasks/ did not land')
  assert.ok(fs.existsSync(path.join(dir, '.agent', 'log')), 'log/ did not land')

  const name = path.basename(dir)
  assert.match(read(dir, '.agent/BOARD.md'), new RegExp('Board — ' + name), 'project name not substituted')
  assert.match(read(dir, '.agent/THREAD.md'), new RegExp('Thread — ' + name), 'project name not substituted')

  // Every generated file .agent/ owns must be marked, or git writes conflict markers into a file
  // whose only correct resolution is to re-run the command that produced it.
  const attrs = read(dir, '.gitattributes')
  for (const generated of ['graph.json', 'meta.json', 'MAP.md', 'SKILLS.md']) {
    assert.ok(attrs.includes('.agent/' + generated), generated + ' is generated but not marked -merge')
  }
})

// The general guard, not one assertion per variable: tpl() substitutes only PROJECT and UTC, so a
// template that grows a third placeholder ships it raw into every project that runs init, and
// nothing else in the suite would notice.
test('init leaves no unsubstituted placeholder anywhere under .agent/', () => {
  const dir = repo()
  cli(dir, 'init')

  const left = []
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name)
      if (e.isDirectory()) {
        walk(abs)
        continue
      }
      if (fs.readFileSync(abs, 'utf8').includes('{{')) left.push(path.relative(dir, abs))
    }
  }
  walk(path.join(dir, '.agent'))
  assert.deepEqual(left, [], 'a template placeholder was written out literally')
})

test('init keeps what the user already wrote in a host file', () => {
  // The old behaviour skipped an existing file entirely, so the project got no rules at all.
  const dir = repo()
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# House style\n\nNo emoji in commits.\n')
  fs.writeFileSync(path.join(dir, '.gitattributes'), '*.png binary\n')

  cli(dir, 'init')
  const claude = read(dir, 'CLAUDE.md')
  assert.match(claude, /No emoji in commits\./, 'their text survived')
  assert.match(claude, /Read `\.agent\/` before you edit/, 'and the rules landed anyway')
  assert.match(read(dir, '.gitattributes'), /\*\.png binary/, 'their gitattributes survived')
})

test('running init twice changes nothing the second time', () => {
  const dir = repo()
  cli(dir, 'init')
  const before = read(dir, 'CLAUDE.md')
  const out = cli(dir, 'init')
  assert.equal(read(dir, 'CLAUDE.md'), before)
  assert.match(out, /already set up/)
})

test('init refuses a host file whose markers were hand-mangled', () => {
  const dir = repo()
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '<!-- godkit:start -->\nhalf a block, no end\n')
  const out = cli(dir, 'init')
  assert.match(out, /! CLAUDE\.md .*malformed/)
  assert.equal(read(dir, 'CLAUDE.md'), '<!-- godkit:start -->\nhalf a block, no end\n', 'left untouched')
})

// --- save -----------------------------------------------------------------------------------

function saveGraph(dir, nodes, extra) {
  // Outside the repo: a scratch file at the project root would itself make the tree dirty.
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-in-')), 'incoming.json')
  trash.push(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify({ project: { name: 'x' }, nodes, edges: [], layers: [], tour: [] }))
  return cli(dir, 'save', file, ...(extra || []))
}

test('a partial save drops nodes whose file is gone', () => {
  const dir = repo()
  cli(dir, 'init')
  fs.writeFileSync(path.join(dir, 'gone.js'), 'x\n')
  saveGraph(dir, [
    { id: 'code.js', filePath: 'code.js', kind: 'file' },
    { id: 'gone.js', filePath: 'gone.js', kind: 'file' },
  ])

  fs.rmSync(path.join(dir, 'gone.js'))
  // A later pass reports only the file it re-analyzed; nothing mentions the deleted one.
  saveGraph(dir, [{ id: 'code.js', filePath: 'code.js', kind: 'file' }])

  const ids = JSON.parse(read(dir, '.agent/graph.json')).nodes.map((n) => n.id)
  assert.deepEqual(ids, ['code.js'], 'the node for the deleted file did not survive the merge')
})

test('a partial save keeps nodes it did not touch', () => {
  const dir = repo()
  cli(dir, 'init')
  fs.writeFileSync(path.join(dir, 'other.js'), 'x\n')
  saveGraph(dir, [
    { id: 'code.js', filePath: 'code.js', kind: 'file' },
    { id: 'other.js', filePath: 'other.js', kind: 'file' },
  ])
  saveGraph(dir, [{ id: 'code.js', filePath: 'code.js', kind: 'file' }])

  const ids = JSON.parse(read(dir, '.agent/graph.json')).nodes.map((n) => n.id).sort()
  assert.deepEqual(ids, ['code.js', 'other.js'])
})

test('save writes the map current, and doctor agrees', () => {
  const dir = repo()
  cli(dir, 'init')
  commitAll(dir)
  saveGraph(dir, [{ id: 'code.js', filePath: 'code.js', kind: 'file' }])
  assert.match(cli(dir, 'doctor'), /map is current/)
})

// --- freshness ------------------------------------------------------------------------------

test('freshness reports a working-tree edit as stale', () => {
  const dir = repo()
  cli(dir, 'init')
  commitAll(dir)
  saveGraph(dir, [{ id: 'code.js', filePath: 'code.js', kind: 'file' }])
  fs.writeFileSync(path.join(dir, 'code.js'), 'const a = 2\n')

  const state = freshness.staleness(dir, path.join(dir, '.agent', 'meta.json'))
  assert.equal(state.state, 'stale')
  assert.deepEqual(state.changed, ['code.js'])
})

test('a rename is one path per side, not one invented filename', () => {
  const dir = repo()
  cli(dir, 'init')
  commitAll(dir)
  saveGraph(dir, [{ id: 'code.js', filePath: 'code.js', kind: 'file' }])
  execFileSync('git', ['mv', 'code.js', 'renamed.js'], { cwd: dir, stdio: 'ignore' })

  const state = freshness.staleness(dir, path.join(dir, '.agent', 'meta.json'))
  assert.equal(state.state, 'stale')
  for (const file of state.changed) {
    assert.ok(!file.includes('->'), 'a rename record must not become a path: ' + file)
  }
  assert.ok(state.changed.includes('renamed.js'))
})

test('a map built at a commit this repo no longer has is stale, never fresh', () => {
  const dir = repo()
  cli(dir, 'init')
  const meta = path.join(dir, '.agent', 'meta.json')
  saveGraph(dir, [{ id: 'code.js', filePath: 'code.js', kind: 'file' }])

  const record = JSON.parse(fs.readFileSync(meta, 'utf8'))
  record.sha = '0'.repeat(40) // a commit that was rebased away, or a shallow clone's cut-off
  fs.writeFileSync(meta, JSON.stringify(record))

  const state = freshness.staleness(dir, meta)
  assert.equal(state.state, 'stale', 'an unanswerable diff must not read as fresh')
  assert.match(freshness.summary(state), /no longer has/)
})

test('no git at all is unknown, not fresh', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-nogit-')))
  trash.push(dir)
  const meta = path.join(dir, 'meta.json')
  fs.writeFileSync(meta, JSON.stringify({ sha: 'a'.repeat(40) }))

  const state = freshness.staleness(dir, meta)
  assert.equal(state.state, 'unknown')
  assert.match(freshness.summary(state), /unverified/)
})

// --- install ownership through the CLI --------------------------------------------------------

test('the hooks subcommand reports without changing anything', () => {
  const dir = repo()
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-home-')))
  trash.push(home)
  const out = execFileSync(process.execPath, [CLI, 'hooks', 'status'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: home, CODEX_HOME: home },
  })
  assert.match(out, /no settings file/)
})

test('hooks install then uninstall round-trips in an isolated settings file', () => {
  const dir = repo()
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-home-')))
  trash.push(home)
  const env = { ...process.env, CLAUDE_CONFIG_DIR: home, CODEX_HOME: path.join(home, 'codex') }
  const run = (...args) =>
    execFileSync(process.execPath, [CLI, 'hooks', ...args], { cwd: dir, encoding: 'utf8', env })

  run('install')
  const file = path.join(home, 'settings.json')
  assert.match(run('status'), /10 of 10 godkit hooks registered/)

  run('uninstall')
  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8')).hooks || {}), '{}')
})

// The exit code is the whole point: a finding has to be able to stop a hook or a CI job, not just
// print something nobody reads.
test('verify exits non-zero on an unproven task and zero once it is proven', () => {
  const dir = repo()
  execFileSync(process.execPath, [CLI, 'init'], { cwd: dir, stdio: 'ignore' })
  const task = path.join(dir, '.agent', 'tasks', 'T-001.md')

  const head = ['---', 'id: T-001', 'owner: claude', 'scope: code.js', 'exit: npm test passes', 'phase: done', '---', '', '## Test', '']
  fs.writeFileSync(task, head.join('\n'))

  const run = () =>
    execFileSync(process.execPath, [CLI, 'verify'], { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })

  let failed = null
  try {
    run()
  } catch (err) {
    failed = err
  }
  assert.ok(failed, 'verify must exit non-zero while a done task has no evidence')
  assert.equal(failed.status, 1)
  assert.match(failed.stdout, /T-001: no-verify/)

  fs.writeFileSync(task, head.concat(['`npm test` -> 12 passing', '']).join('\n'))
  assert.match(run(), /tasks: clean/)
})

test('doctor counts unproven tasks without counting log findings', () => {
  const dir = repo()
  execFileSync(process.execPath, [CLI, 'init'], { cwd: dir, stdio: 'ignore' })
  fs.writeFileSync(
    path.join(dir, '.agent', 'tasks', 'T-001.md'),
    ['---', 'id: T-001', 'owner: claude', 'scope: code.js', 'exit:', 'phase: plan', '---', ''].join('\n'),
  )
  fs.writeFileSync(
    path.join(dir, '.agent', 'log', '2026-08-31T1200Z-claude-aaaa1111.md'),
    ['---', 'session: "aaaa1111"', 'status: "done"', '---', '', '## Verified', ''].join('\n'),
  )

  const out = execFileSync(process.execPath, [CLI, 'doctor'], { cwd: dir, encoding: 'utf8' })
  assert.match(out, /tasks {8}1 \(1 unproven/)
})
