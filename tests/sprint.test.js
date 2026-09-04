'use strict'
// A sprint is a goal plus waves of file-disjoint tasks. The half a machine can own is: find the
// sprints, resolve the task ids the wave table names, and refuse to close while any of them is
// unfinished or finished with nothing behind it. These tests pin that refusal — a sprint that
// closes on an unproven task is worse than no sprint, because it says "shipped".

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const sprint = require('../lib/sprint')

const trash = []
process.on('exit', () => {
  for (const dir of trash) fs.rmSync(dir, { recursive: true, force: true })
})

function project() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-sprint-')))
  trash.push(dir)
  const agent = path.join(dir, '.agent')
  fs.mkdirSync(path.join(agent, 'sprints'), { recursive: true })
  fs.mkdirSync(path.join(agent, 'tasks'), { recursive: true })
  fs.mkdirSync(path.join(agent, 'log'), { recursive: true })
  return agent
}

function write(agent, rel, body) {
  const file = path.join(agent, rel)
  fs.writeFileSync(file, body)
  return file
}

function openSprint(agent, id, ids) {
  return write(agent, path.join('sprints', id + '.md'),
    '---\nid: ' + id + '\ngoal: "ship auth"\nstatus: open\n---\n\n## Waves\n\n' +
    '| wave | tasks |\n|---|---|\n| 1 | ' + ids.join(' ') + ' |\n')
}

function doneTask(agent, id, extra) {
  return write(agent, path.join('tasks', id + '-x.md'),
    '---\nid: ' + id + '\nowner: claude-opus-5\nscope: src/a.ts\nexit: npm test\n' +
    'phase: ' + ((extra && extra.phase) || 'done') + '\n---\n\n' +
    '## Test\n\n' + ((extra && extra.test) || '`npm test` -> 12 pass') + '\n\n## Handoff\n\nnothing left\n')
}

test('ids are monotonic and zero-padded so they sort', () => {
  const agent = project()
  assert.equal(sprint.nextId(agent), 'S-001')
  openSprint(agent, 'S-001', ['T-001'])
  assert.equal(sprint.nextId(agent), 'S-002')
  openSprint(agent, 'S-009', ['T-001'])
  assert.equal(sprint.nextId(agent), 'S-010')
})

test('task ids come out of the wave table, in order, without duplicates', () => {
  const agent = project()
  write(agent, path.join('sprints', 'S-001.md'),
    '---\nid: S-001\ngoal: "g"\nstatus: open\n---\n\n| 1 | T-002 T-001 |\n| 2 | T-002 T-003 |\n')
  assert.deepEqual(sprint.current(agent).taskIds, ['T-002', 'T-001', 'T-003'])
})

test('a wave table naming a task nobody wrote is reported, not skipped', () => {
  // The failure this exists to catch: a plan that reads complete because the id is in the table.
  const agent = project()
  openSprint(agent, 'S-001', ['T-001'])
  const blockers = sprint.blockers(agent, sprint.current(agent))
  assert.equal(blockers.length, 1)
  assert.match(blockers[0], /T-001 — named in the sprint, no task file/)
})

test('a commented-out example wave table names no real tasks', () => {
  // The template teaches the wave table with a worked example inside <!-- -->. Reading T-001 out
  // of that comment would report a task nobody wrote as missing on every single fresh sprint.
  const agent = project()
  const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'sprint.md'), 'utf8')
  write(agent, path.join('sprints', 'S-001.md'),
    template.replace('{{ID}}', 'S-001').replace(/\{\{GOAL\}\}/g, 'ship auth').replace('{{UTC}}', '2026-09-05T0000Z'))
  assert.deepEqual(sprint.current(agent).taskIds, [])
})

test('close is refused while a task is unfinished', () => {
  const agent = project()
  openSprint(agent, 'S-001', ['T-001', 'T-002'])
  doneTask(agent, 'T-001')
  doneTask(agent, 'T-002', { phase: 'execute' })
  const blockers = sprint.blockers(agent, sprint.current(agent))
  assert.ok(blockers.some((b) => b.startsWith('T-002 — phase: execute')), blockers.join(' | '))
})

test('close is refused when a done task has no evidence', () => {
  // Same rule godkit verify applies, scoped to one goal — a `done` task with an empty ## Test.
  const agent = project()
  openSprint(agent, 'S-001', ['T-001'])
  doneTask(agent, 'T-001', { test: '<!-- -->' })
  const blockers = sprint.blockers(agent, sprint.current(agent))
  assert.ok(blockers.some((b) => b.includes('no-verify')), blockers.join(' | '))
})

test('an empty sprint cannot close either', () => {
  const agent = project()
  openSprint(agent, 'S-001', [])
  assert.deepEqual(sprint.blockers(agent, sprint.current(agent)),
    ['S-001 — no tasks named in the wave table'])
})

test('everything done and proven closes, and close only rewrites the status line', () => {
  const agent = project()
  const file = openSprint(agent, 'S-001', ['T-001'])
  doneTask(agent, 'T-001')
  const open = sprint.current(agent)
  assert.deepEqual(sprint.blockers(agent, open), [])
  const closed = sprint.close(agent, open)
  assert.match(closed, /^status: closed$/m)
  assert.ok(closed.includes('| 1 | T-001 |'), 'the wave table must survive close')
  fs.writeFileSync(file, closed)
  assert.equal(sprint.current(agent).status, 'closed')
})

test('current() prefers the newest OPEN sprint over a newer closed one', () => {
  const agent = project()
  openSprint(agent, 'S-001', ['T-001'])
  write(agent, path.join('sprints', 'S-002.md'),
    '---\nid: S-002\ngoal: "done already"\nstatus: closed\n---\n\n| 1 | T-009 |\n')
  assert.equal(sprint.current(agent).id, 'S-001')
})
