'use strict'
// Hand a task to ANOTHER agent CLI, headless, in its own context, and get back a short answer.
// This is the subagent for hosts that have none, and a way to put a different model on a review.
//
// The flags below are the ones each CLI's own `--help` lists on this machine's versions:
//   claude   -p (prompt on stdin), --permission-mode, --allowed-tools
//   codex    exec --sandbox read-only|workspace-write ... - (prompt on stdin)
//   gemini   -p, --approval-mode plan|auto_edit
//   agy      --print, --mode plan|accept-edits
// Read-only is the default and is enforced by the CLI itself, not by asking nicely. `write: true` is
// an explicit choice. A delegated agent cannot delegate again (GODKIT_DELEGATE_DEPTH).
//
// godkit: one process, no streaming, answer capped at 6KB. Add a job queue if a delegation needs to
// outlive the caller; an MCP client will usually give up on a call before a long run ends.

const path = require('path')
const { spawnSync } = require('child_process')

const { fitBytes } = require('./paths')

const WIN = process.platform === 'win32'
const MAX_ANSWER = 6000
const PREFIX =
  'You are a delegated subagent working in this repository. Do only the task below, then reply with ' +
  'the result first in at most 15 lines. Do not delegate further.\n\nTask:\n'

// win32 npm shims (codex.cmd, gemini.cmd) need a shell; every argument is a fixed string, never
// the task text, which travels on stdin. A fixed argument with a space is quoted by hand.
const q = (a) => (WIN && /\s/.test(a) ? '"' + a + '"' : a)

const HOSTS = {
  claude: {
    bin: 'claude',
    shell: false,
    build: ({ write }) => ({
      args: ['-p', '--permission-mode', write ? 'acceptEdits' : 'dontAsk'].concat(write ? [] : ['--allowed-tools', 'Read', 'Grep', 'Glob']),
      stdin: true,
    }),
  },
  codex: {
    bin: 'codex',
    shell: WIN,
    build: ({ write }) => ({
      args: ['exec', '--sandbox', write ? 'workspace-write' : 'read-only', '--skip-git-repo-check', '--ephemeral', '--color', 'never', '-'],
      stdin: true,
    }),
  },
  gemini: {
    bin: 'gemini',
    shell: WIN,
    build: ({ write }) => ({ args: ['-p', q('Do the task given on stdin.'), '--approval-mode', write ? 'auto_edit' : 'plan'], stdin: true }),
  },
  agy: {
    bin: 'agy',
    shell: false,
    build: ({ write, prompt }) => ({ args: ['--print', prompt, '--mode', write ? 'accept-edits' : 'plan'], stdin: false }),
  },
}

function onPath(bin, env) {
  const dirs = String((env || process.env).PATH || (env || process.env).Path || '').split(path.delimiter).filter(Boolean)
  const exts = WIN ? ['', '.exe', '.cmd', '.bat'] : ['']
  const fs = require('fs')
  return dirs.some((d) => exts.some((x) => fs.existsSync(path.join(d, bin + x))))
}

function available(hosts) {
  return Object.entries(hosts || HOSTS).map(([name, spec]) => ({ name, found: onPath(spec.bin) }))
}

// opts: { host, task, write, cwd, timeoutMs, hosts (override table, for tests) }
function delegate(opts) {
  const table = opts.hosts || HOSTS
  const spec = table[opts.host]
  if (!spec) throw new Error('unknown host "' + opts.host + '"; one of: ' + Object.keys(table).join(', '))
  if (process.env.GODKIT_DELEGATE_DEPTH) throw new Error('a delegated agent cannot delegate again')
  const task = String(opts.task || '').trim()
  if (!task) throw new Error('task is empty')
  const prompt = PREFIX + task
  const built = spec.build({ write: Boolean(opts.write), prompt })
  const started = Date.now()
  // An npm shim on Windows is a .cmd file: run it through cmd.exe with a line we build ourselves
  // (fixed arguments only), which avoids the shell:true path Node now warns about.
  const viaCmd = Boolean(spec.shell) && WIN
  const run = spawnSync(viaCmd ? process.env.ComSpec || 'cmd.exe' : spec.bin, viaCmd ? ['/d', '/s', '/c', '"' + [spec.bin].concat(built.args).join(' ') + '"'] : built.args, {
    cwd: opts.cwd || process.cwd(),
    input: built.stdin ? prompt : undefined,
    encoding: 'utf8',
    timeout: opts.timeoutMs || 300000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    windowsVerbatimArguments: viaCmd,
    env: Object.assign({}, process.env, { GODKIT_DELEGATE_DEPTH: '1' }),
  })
  const ms = Date.now() - started
  if (run.error) {
    const why = run.error.code === 'ENOENT' ? spec.bin + ' is not on PATH' : run.error.code === 'ETIMEDOUT' ? 'timed out after ' + Math.round(ms / 1000) + 's' : run.error.message
    return { ok: false, host: opts.host, ms, text: why }
  }
  const out = String(run.stdout || '').trim()
  if (run.status !== 0) {
    // The reason is at the end of a CLI's output, after its banner and warnings.
    return { ok: false, host: opts.host, ms, text: fitBytes(String(run.stderr || '').trim() || out || 'exit ' + run.status, 1500, true) }
  }
  return { ok: true, host: opts.host, ms, text: out ? fitBytes(out, MAX_ANSWER) : '(no output)' }
}

module.exports = { HOSTS, PREFIX, MAX_ANSWER, available, delegate }
