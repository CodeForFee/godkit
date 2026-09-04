'use strict'
// A sprint is a goal plus waves of file-disjoint tasks. This file does only the half a machine can
// do: find the sprints, resolve the task ids they name, and say whether every one of them is
// finished with evidence behind it. Cutting the waves is judgment and stays with the model.
//
// Nothing here re-parses frontmatter or re-reads task files by hand — lib/contract.js already owns
// both, including the rule that a `done` task with an empty `## Test` is not done.

const path = require('path')
const { containedEntries, paths, readContained } = require('./paths')
const { checkTask, parseFrontmatter, taskEntries } = require('./contract')

const MAX_BYTES = 64 * 1024
const ID = /^S-(\d{3,})$/

function read(agentDir, file) {
  const result = readContained(agentDir, file, MAX_BYTES, false)
  return result ? result.text : null
}

// Sprint files, oldest first. Same containment rules as tasks and logs: bounded, symlink-refusing.
function sprintEntries(agentDir) {
  return containedEntries(agentDir, path.join(agentDir, 'sprints'))
    .filter((entry) => entry.isFile && entry.name.endsWith('.md'))
    .map((entry) => entry.path)
    .sort()
}

function meta(agentDir, file) {
  const text = read(agentDir, file)
  if (text === null) return null
  const front = parseFrontmatter(text)
  return {
    file,
    id: front.id || path.basename(file, '.md'),
    goal: front.goal || '',
    status: (front.status || 'open').toLowerCase(),
    // Task ids the body names, in first-appearance order. The wave table is markdown a human and a
    // model both edit, so the ids are read out of the text rather than out of a second index that
    // would immediately disagree with it.
    // Comments are stripped first: the template ships a worked example wave table inside
    // <!-- -->, and reading its ids would report a task nobody ever wrote as missing on every
    // fresh sprint.
    taskIds: unique(uncommented(text).match(/\bT-\d{3,}\b/g) || []),
    text,
  }
}

function unique(list) {
  return Array.from(new Set(list))
}

function uncommented(text) {
  return String(text || '').replace(/<!--[\s\S]*?-->/g, '')
}

// The newest open sprint, or the newest of any status when none is open. Ids sort lexically
// because they are zero-padded, which is the reason they are.
function current(agentDir) {
  const all = sprintEntries(agentDir).map((f) => meta(agentDir, f)).filter(Boolean)
  if (!all.length) return null
  const open = all.filter((s) => s.status === 'open')
  return (open.length ? open : all)[(open.length ? open : all).length - 1]
}

function nextId(agentDir) {
  let highest = 0
  for (const file of sprintEntries(agentDir)) {
    const match = ID.exec(path.basename(file, '.md').split('-').slice(0, 2).join('-'))
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return 'S-' + String(highest + 1).padStart(3, '0')
}

// Every task the sprint names, with what the contract says about it. A named id with no file is
// reported rather than skipped: a wave table pointing at a task nobody wrote is the exact failure
// this is here to surface.
function tasks(agentDir, sprint) {
  const byId = new Map()
  for (const file of taskEntries(agentDir)) {
    const text = read(agentDir, file)
    if (text === null) continue
    const front = parseFrontmatter(text)
    const id = front.id || path.basename(file, '.md').split('-').slice(0, 2).join('-')
    byId.set(id, { id, file, owner: front.owner || 'unassigned', phase: (front.phase || 'plan').toLowerCase() })
  }

  return sprint.taskIds.map((id) => {
    const found = byId.get(id)
    if (!found) return { id, missing: true, findings: [] }
    return Object.assign({ missing: false }, found, { findings: checkTask(agentDir, found.file) })
  })
}

// Closeable when every named task exists, is `done`, and carries no contract finding. Returns the
// reasons rather than a boolean, because "why not" is the only useful half.
function blockers(agentDir, sprint) {
  const out = []
  for (const task of tasks(agentDir, sprint)) {
    if (task.missing) {
      out.push(task.id + ' — named in the sprint, no task file for it')
      continue
    }
    if (task.phase !== 'done') out.push(task.id + ' — phase: ' + task.phase)
    for (const finding of task.findings) out.push(task.id + ' — ' + finding.tag + ': ' + finding.message)
  }
  if (!sprint.taskIds.length) out.push(sprint.id + ' — no tasks named in the wave table')
  return out
}

function close(agentDir, sprint) {
  const replaced = sprint.text.replace(/^status:\s*open\s*(#.*)?$/mi, 'status: closed')
  if (replaced === sprint.text) throw new Error(sprint.id + ' has no `status: open` line to close')
  return replaced
}

module.exports = { ID, sprintEntries, meta, current, nextId, tasks, blockers, close, paths }
