'use strict'
// `.agent/tasks/` and `.agent/log/` were write-only: the templates state that a task needs a
// checkable exit, that a `done` claim needs evidence, and that anything else needs a handoff —
// and nothing ever read a file back. These tests pin the rules to the sentences that state them.
// Structural only: present / non-empty / not the template placeholder. Whether the evidence is
// any GOOD is godkit-review's job, and a fuzzy check here would just teach agents to game it.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const contract = require('../lib/contract')

const trash = []
process.on('exit', () => {
  for (const dir of trash) fs.rmSync(dir, { recursive: true, force: true })
})

function project() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-contract-')))
  trash.push(dir)
  const agent = path.join(dir, '.agent')
  fs.mkdirSync(path.join(agent, 'tasks'), { recursive: true })
  fs.mkdirSync(path.join(agent, 'log'), { recursive: true })
  return { dir, agent }
}

function task(agent, name, body) {
  const file = path.join(agent, 'tasks', name)
  fs.writeFileSync(file, body)
  return file
}

function entry(agent, name, body) {
  const file = path.join(agent, 'log', name)
  fs.writeFileSync(file, body)
  return file
}

const tags = (findings) => findings.map((f) => f.tag).sort()

test('a task that proves itself reports nothing', () => {
  const { agent } = project()
  const file = task(
    agent,
    'T-001.md',
    [
      '---',
      'id: T-001',
      'owner: claude',
      'scope: lib/contract.js',
      'exit: npm test passes',
      'phase: done',
      '---',
      '',
      '## Test',
      '`npm test` -> 12 passing',
      '',
    ].join('\n'),
  )
  assert.deepEqual(contract.checkTask(agent, file), [])
})

test('a done task with only the template comment under Test is not proven', () => {
  const { agent } = project()
  const file = task(
    agent,
    'T-002.md',
    [
      '---',
      'id: T-002',
      'owner: claude',
      'scope: src/api',
      'exit: the endpoint returns 200',
      'phase: done',
      '---',
      '',
      '## Test',
      '',
      '<!-- The command run and its real output. "Should work" is not a result. -->',
      '',
    ].join('\n'),
  )
  assert.deepEqual(tags(contract.checkTask(agent, file)), ['no-verify'])
})

test('a missing Test heading fails the same way an empty one does', () => {
  const { agent } = project()
  const file = task(
    agent,
    'T-003.md',
    ['---', 'id: T-003', 'owner: claude', 'scope: src', 'exit: tests pass', 'phase: done', '---', ''].join('\n'),
  )
  assert.deepEqual(tags(contract.checkTask(agent, file)), ['no-verify'])
})

test('an empty exit condition means nothing can prove the task done', () => {
  const { agent } = project()
  const file = task(
    agent,
    'T-004.md',
    ['---', 'id: T-004', 'owner: claude', 'scope: src', 'exit:', 'phase: plan', '---', ''].join('\n'),
  )
  assert.deepEqual(tags(contract.checkTask(agent, file)), ['no-exit'])
})

test('work under way with nobody owning it is a finding, but a plan-phase task is not', () => {
  const { agent } = project()
  const head = ['---', 'id: T-005', 'owner: unassigned', 'scope: src', 'exit: tests pass']
  const tail = ['---', '', '## Handoff', '- next: wire the route', '']

  const planning = task(agent, 'T-005.md', head.concat(['phase: plan'], tail).join('\n'))
  assert.deepEqual(contract.checkTask(agent, planning), [])

  const running = task(agent, 'T-006.md', head.concat(['phase: execute'], tail).join('\n'))
  assert.deepEqual(tags(contract.checkTask(agent, running)), ['no-exit'])
})

test('an unfinished task with an empty Handoff leaves the next agent nothing', () => {
  const { agent } = project()
  const file = task(
    agent,
    'T-007.md',
    [
      '---',
      'id: T-007',
      'owner: codex',
      'scope: src',
      'exit: tests pass',
      'phase: review',
      '---',
      '',
      '## Handoff',
      '',
      '<!-- Left / next. -->',
      '',
    ].join('\n'),
  )
  assert.deepEqual(tags(contract.checkTask(agent, file)), ['resume-blocked'])
})

test('a blocked task must say which kind of blocked it is', () => {
  const { agent } = project()
  const head = ['---', 'id: T-008', 'owner: codex', 'scope: src', 'exit: tests pass', 'phase: blocked']
  const tail = ['---', '', '## Handoff', '- waiting on the staging key', '']

  const untyped = task(agent, 'T-008.md', head.concat(tail).join('\n'))
  assert.deepEqual(tags(contract.checkTask(agent, untyped)), ['resume-blocked'])

  const nonsense = task(agent, 'T-009.md', head.concat(['blocked: because'], tail).join('\n'))
  assert.deepEqual(tags(contract.checkTask(agent, nonsense)), ['resume-blocked'])

  for (const reason of contract.BLOCKERS) {
    const typed = task(agent, 'T-ok-' + reason + '.md', head.concat(['blocked: ' + reason], tail).join('\n'))
    assert.deepEqual(contract.checkTask(agent, typed), [], reason + ' should be accepted')
  }
})

test('the shipped task template parses, and its own placeholders do not pass as content', () => {
  const { agent } = project()
  const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'task.md'), 'utf8')
  const meta = contract.parseFrontmatter(template)
  // `blocked:` carries a trailing "# a | b | c" hint. An empty value with a comment is empty.
  assert.equal(meta.blocked, '')
  assert.equal(meta.phase, 'plan')
  for (const heading of ['Plan', 'Execute', 'Review', 'Test', 'Handoff']) {
    assert.equal(contract.empty(contract.section(template, heading)), true, heading + ' should read as empty')
  }
  const file = task(agent, 'T-010.md', template)
  // Fresh from the template it is phase: plan, so only the unfilled exit and scope are findings.
  assert.deepEqual(tags(contract.checkTask(agent, file)), ['no-exit', 'no-exit'])
})

test('a log claiming done with an empty Verified proves nothing', () => {
  const { agent } = project()
  const file = entry(
    agent,
    '2026-08-31T1200Z-claude-aaaa1111.md',
    ['---', 'agent: "claude"', 'session: "aaaa1111"', 'status: "done"', '---', '', '## Verified', '', '<!-- x -->', ''].join('\n'),
  )
  assert.deepEqual(tags(contract.checkLog(agent, file)), ['no-verify'])
})

test('a log carrying a real command and its output is accepted', () => {
  const { agent } = project()
  const file = entry(
    agent,
    '2026-08-31T1201Z-claude-bbbb2222.md',
    ['---', 'agent: "claude"', 'session: "bbbb2222"', 'status: "done"', '---', '', '## Verified', '- `npm test` -> 12 passing', ''].join('\n'),
  )
  assert.deepEqual(contract.checkLog(agent, file), [])
})

test('a partial or blocked log must say what is left', () => {
  const { agent } = project()
  for (const status of ['partial', 'blocked']) {
    const bad = entry(
      agent,
      '2026-08-31T1202Z-claude-' + status + '.md',
      ['---', 'session: "s"', 'status: "' + status + '"', '---', '', '## Verified', '- `npm test` -> ok', '', '## Left / next', '', '<!-- -->', ''].join('\n'),
    )
    assert.deepEqual(tags(contract.checkLog(agent, bad)), ['resume-blocked'], status)

    const good = entry(
      agent,
      '2026-08-31T1203Z-claude-' + status + '-ok.md',
      ['---', 'session: "s"', 'status: "' + status + '"', '---', '', '## Left / next', '- the migration is still unwritten', ''].join('\n'),
    )
    assert.deepEqual(contract.checkLog(agent, good), [], status + ' with a real handoff')
  }
})

test('the shipped log template does not pass its own checks as done', () => {
  const { agent } = project()
  const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'log.md'), 'utf8')
  assert.equal(contract.parseFrontmatter(template).status, 'done')
  const file = entry(agent, '2026-08-31T1204Z-claude-cccc3333.md', template)
  assert.deepEqual(tags(contract.checkLog(agent, file)), ['no-verify'])
})

test('a symlinked task is refused rather than followed', (t) => {
  const { dir, agent } = project()
  const outside = path.join(dir, 'outside.md')
  fs.writeFileSync(outside, '---\nid: X\nphase: done\n---\n')
  const link = path.join(agent, 'tasks', 'linked.md')
  try {
    fs.symlinkSync(outside, link)
  } catch {
    return t.skip('symlinks not permitted in this environment')
  }
  assert.deepEqual(contract.checkTask(agent, link), [])
  assert.deepEqual(contract.taskEntries(agent), [])
})

test('checkAll covers both directories and survives an empty project', () => {
  const { dir, agent } = project()
  assert.deepEqual(contract.checkAll(dir), [])

  task(agent, 'T-020.md', ['---', 'id: T-020', 'owner: c', 'scope: s', 'exit:', 'phase: plan', '---', ''].join('\n'))
  entry(agent, '2026-08-31T1205Z-claude-dddd4444.md', ['---', 'session: "d"', 'status: "done"', '---', '', '## Verified', ''].join('\n'))

  const findings = contract.checkAll(dir)
  assert.deepEqual(findings.map((f) => f.kind).sort(), ['log', 'task'])
  assert.deepEqual(tags(findings), ['no-exit', 'no-verify'])
})

test('a project with no .agent/ at all does not throw', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-contract-bare-')))
  trash.push(dir)
  assert.doesNotThrow(() => contract.checkAll(dir))
})
