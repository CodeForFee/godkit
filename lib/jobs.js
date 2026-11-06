'use strict'
// Background runs. A named subagent (or a whole team) started here runs in its own detached process
// and writes its result to a status file, so the caller is free the moment it starts: a leader can
// start a wave of members at once, and the MCP server (which answers one call at a time) never
// blocks on a member that takes ten minutes.
//
//   start(kind, payload)   -> { id, ... }   writes <id>.json, spawns `node lib/jobs.js <id>`
//   status(id)                              the record; a "running" job whose process is gone is "lost"
//   list()                                  newest first
//   wait(ids, timeoutMs)                    until all are finished or the time is up; never longer
//
// godkit: status files in ~/.godkit/jobs, polled. No queue, no daemon; jobs older than a week are
// pruned at the next start. Add a notification channel if a host ever offers one to MCP servers.

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')

const KEEP_MS = 7 * 24 * 3600 * 1000
const KINDS = ['agent', 'team']

function dir() {
  return path.join(process.env.GODKIT_HOME || path.join(os.homedir(), '.godkit'), 'jobs')
}

const fileOf = (id) => path.join(dir(), id + '.json')

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

// On Windows a file that is being replaced can refuse a read or a rename for a moment (EPERM, EBUSY).
// Both sides retry briefly, so a reader never mistakes that moment for "no such job", and a job's
// final result is never lost to it.
function read(id) {
  if (!/^[a-z0-9-]+$/.test(String(id))) return null
  for (let i = 0; ; i++) {
    try {
      return JSON.parse(fs.readFileSync(fileOf(id), 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT' || i >= 20) return null
      sleep(25)
    }
  }
}

// Temp-and-rename, so a reader never sees half a file.
function write(job) {
  fs.mkdirSync(dir(), { recursive: true })
  const tmp = fileOf(job.id) + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2))
  for (let i = 0; ; i++) {
    try {
      return fs.renameSync(tmp, fileOf(job.id))
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || i >= 40) throw error
      sleep(25)
    }
  }
}

const alive = (pid) => {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function prune() {
  let files = []
  try {
    files = fs.readdirSync(dir()).filter((f) => f.endsWith('.json'))
  } catch {
    return
  }
  for (const f of files) {
    const job = read(f.slice(0, -5))
    if (job && job.state !== 'running' && Date.now() - Date.parse(job.ended || job.started) > KEEP_MS) fs.rmSync(fileOf(job.id), { force: true })
  }
}

// payload for 'agent': the options of subagent.runAgent; for 'team': the options of team.run.
// hostsModule (optional): a module exporting a host table, for hosts godkit does not ship (and tests).
function start(kind, payload) {
  if (!KINDS.includes(kind)) throw new Error('unknown job kind "' + kind + '"')
  prune()
  const id = kind + '-' + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').slice(2) + '-' + crypto.randomBytes(3).toString('hex')
  const job = { id, kind, state: 'running', started: new Date().toISOString(), title: String(payload.name ? payload.name + ': ' : '') + String(payload.task || payload.goal || '').split(/\r?\n/)[0].slice(0, 100), payload }
  write(job)
  const child = spawn(process.execPath, [__filename, id], { cwd: payload.cwd || process.cwd(), detached: true, stdio: 'ignore', windowsHide: true, env: process.env })
  child.unref()
  // Only the job process writes its file from here on (it records its own pid first), so a result
  // it writes can never be overwritten by this side.
  return Object.assign({}, job, { pid: child.pid })
}

function status(id) {
  const job = read(id)
  if (!job) return null
  // Running, but no process behind it any more (killed, machine restarted), or one that never got as
  // far as recording itself: it will never finish.
  const age = Date.now() - Date.parse(job.started)
  if (job.state === 'running' && (job.pid ? !alive(job.pid) && age > 3000 : age > 60000)) {
    const again = read(id) // it may have written its result between the two reads
    if (again && again.state !== 'running') return again
    job.state = 'lost'
    job.ended = new Date().toISOString()
    job.result = { ok: false, text: 'the process running this job is gone without a result' }
    write(job)
  }
  return job
}

function list() {
  let files = []
  try {
    files = fs.readdirSync(dir()).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  return files.map((f) => status(f.slice(0, -5))).filter(Boolean).sort((a, b) => String(b.started).localeCompare(String(a.started)))
}

// Blocks the calling process (a CLI, or the team leader's own job) until every job is finished or
// timeoutMs has passed. Returns the records either way; the caller checks .state.
function wait(ids, timeoutMs) {
  const until = Date.now() + Math.max(0, Number(timeoutMs) || 0)
  for (;;) {
    const jobs = ids.map((id) => status(id) || { id, state: fs.existsSync(fileOf(id)) ? 'running' : 'missing' })
    if (jobs.every((j) => j.state !== 'running') || Date.now() >= until) return jobs
    sleep(Math.min(500, Math.max(10, until - Date.now())))
  }
}

// --- the job process itself --------------------------------------------------------------------

function runJob(id) {
  const job = read(id)
  if (!job || job.state !== 'running') return
  write(Object.assign(job, { pid: process.pid }))
  let result
  try {
    const payload = Object.assign({}, job.payload)
    if (payload.hostsModule) payload.hosts = require(path.resolve(payload.hostsModule))
    if (job.kind === 'agent') result = require('./subagent').runAgent(payload)
    else result = require('./team').run(payload)
  } catch (error) {
    result = { ok: false, text: error.message }
  }
  const now = read(id) || job
  write(Object.assign(now, { state: result && result.ok ? 'done' : 'failed', ended: new Date().toISOString(), result }))
}

if (require.main === module) runJob(process.argv[2])

module.exports = { dir, start, status, list, wait, runJob }
