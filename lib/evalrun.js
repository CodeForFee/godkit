'use strict'
// "Every agent works as well as Claude Code" is a claim until something measures it. An eval is a small
// repo (files), a prompt, and a command that exits 0 only when the work is right. Each run gets a
// fresh git repo in a temp folder, one agent CLI does the task headless with write access, and the
// check decides. Nothing here judges how the agent got there; pass or fail, and how long.
//
// godkit: pass/fail and seconds only. Token counts differ per CLI and none of them print one in a
// form worth parsing yet; add them per host when one does. A task is attempted once: use more runs
// (`--runs`) to see variance, not a longer timeout.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync, execFileSync } = require('child_process')

const { delegate } = require('./delegate')

const DIR = path.resolve(__dirname, '..', 'evals')

function loadTasks(dir) {
  const base = dir || DIR
  let files = []
  try {
    files = fs.readdirSync(base).filter((f) => f.endsWith('.json')).sort()
  } catch {
    return []
  }
  return files.map((f) => {
    const task = JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'))
    for (const k of ['id', 'prompt', 'check']) if (typeof task[k] !== 'string' || !task[k]) throw new Error(f + ': "' + k + '" is required')
    if (!task.files || typeof task.files !== 'object') throw new Error(f + ': "files" is required')
    return task
  })
}

function workspace(task, withGodkit) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-eval-')))
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' })
  git('init', '-q')
  git('config', 'user.email', 'eval@example.com')
  git('config', 'user.name', 'eval')
  for (const [name, body] of Object.entries(task.files)) {
    const file = path.join(dir, name)
    if (!path.resolve(file).startsWith(dir + path.sep)) throw new Error('task file escapes its folder: ' + name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, body)
  }
  git('add', '-A')
  git('commit', '-qm', 'task start')
  if (withGodkit) {
    execFileSync(process.execPath, [path.resolve(__dirname, '..', 'bin', 'godkit.js'), 'init', '--no-install', '--no-mcp', '--no-githook'], { cwd: dir, stdio: 'ignore' })
  }
  return dir
}

// One attempt: { id, host, pass, ms, note }
function runTask(task, opts) {
  const o = opts || {}
  const dir = workspace(task, o.godkit)
  const started = Date.now()
  try {
    const agent = delegate({ host: o.host, task: task.prompt, write: true, cwd: dir, timeoutMs: (o.timeoutSec || 600) * 1000, hosts: o.hosts })
    const check = spawnSync(task.check, { cwd: dir, shell: true, encoding: 'utf8', timeout: 60000, windowsHide: true })
    const pass = check.status === 0
    const note = pass ? '' : agent.ok ? 'check failed: ' + String(check.stdout + check.stderr).trim().split(/\r?\n/).slice(-2).join(' / ') : 'agent failed: ' + agent.text.split(/\r?\n/).slice(-1)[0]
    return { id: task.id, host: o.host, pass, ms: Date.now() - started, note }
  } finally {
    if (!o.keep) fs.rmSync(dir, { recursive: true, force: true })
    else process.stderr.write('kept ' + dir + '\n')
  }
}

// opts: { hosts: [names], tasks (filter ids), runs, godkit, timeoutSec, keep, table (override host table) }
function runAll(opts) {
  const o = opts || {}
  const tasks = loadTasks(o.dir).filter((t) => !o.only || o.only.includes(t.id))
  const results = []
  for (const host of o.hosts || []) {
    for (const task of tasks) {
      for (let i = 0; i < (o.runs || 1); i++) {
        const r = runTask(task, { host, godkit: o.godkit, timeoutSec: o.timeoutSec, keep: o.keep, hosts: o.table })
        results.push(r)
        if (o.onResult) o.onResult(r)
      }
    }
  }
  const summary = {}
  for (const r of results) {
    const s = (summary[r.host] = summary[r.host] || { passed: 0, total: 0, ms: 0 })
    s.total++
    s.ms += r.ms
    if (r.pass) s.passed++
  }
  return { results, summary }
}

module.exports = { DIR, loadTasks, runTask, runAll }
