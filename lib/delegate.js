'use strict'
// Hand a task to ANOTHER agent CLI, headless, in its own context, and get back a short answer.
// This is the subagent for hosts that have none, and a way to put a different model on a review.
// lib/subagent.js builds Claude-style named subagents on top of execute() below.
//
// The flags are the ones each CLI's own `--help` lists on this machine's versions:
//   claude   -p (prompt on stdin), --permission-mode, --allowed-tools, --model
//   codex    exec --sandbox read-only|workspace-write, -m, -c, -o (last message to a file), - (stdin)
//   gemini   -p, --approval-mode plan|auto_edit
//   agy      --print, --mode plan|accept-edits
// Read-only is the default and is enforced by the CLI itself (a sandbox or a permission mode), not by
// asking nicely. `write: true` is an explicit choice.
//
// godkit: one process, no streaming, answer capped at 6KB. Add a job queue if a delegation needs to
// outlive the caller; an MCP client will usually give up on a call before a long run ends.

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const { fitBytes } = require('./paths')

const WIN = process.platform === 'win32'
const MAX_ANSWER = 6000
const PREFIX =
  'You are a delegated subagent working in this repository. Do only the task below, then reply with ' +
  'the result first in at most 15 lines. Do not delegate further.\n\nTask:\n'

// cmd.exe gets one line we build, so every argument is quoted by the rules of the C runtime that will
// parse it (backslashes before a quote doubled, the quote escaped). Used for the .cmd shims only.
function winQuote(arg) {
  if (!/[\s"&|<>^%{}=,;()!]/.test(arg)) return arg
  return '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"'
}

const READ_TOOLS = ['Read', 'Grep', 'Glob']

const HOSTS = {
  claude: {
    bin: 'claude',
    shell: false,
    build: ({ write, tools, model }) => {
      const allowed = tools && tools.length ? tools : write ? [] : READ_TOOLS
      return {
        args: ['-p', '--permission-mode', write ? 'acceptEdits' : 'dontAsk']
          .concat(model ? ['--model', model] : [], allowed.length ? ['--allowed-tools'].concat(allowed) : []),
        stdin: true,
      }
    },
  },
  codex: {
    bin: 'codex',
    shell: WIN,
    // The model is explicit on purpose when given: a user's configured default may be one their account
    // rejects, and a subagent should not fail for that.
    build: ({ write, model, effort, depth, outFile }) => ({
      args: ['exec', '--sandbox', write ? 'workspace-write' : 'read-only', '--skip-git-repo-check', '--ephemeral', '--color', 'never']
        .concat(model ? ['-m', model] : [], effort ? ['-c', 'model_reasoning_effort="' + effort + '"'] : [], depth ? ['-c', 'mcp_servers.godkit.env.GODKIT_AGENT_DEPTH="' + depth + '"'] : [], ['-o', outFile, '-']),
      stdin: true,
      outFile: true,
    }),
  },
  gemini: {
    bin: 'gemini',
    shell: WIN,
    build: ({ write }) => ({ args: ['-p', 'Do the task given on stdin.', '--approval-mode', write ? 'auto_edit' : 'plan'], stdin: true }),
  },
  agy: {
    bin: 'agy',
    shell: false,
    // A model can be out of capacity for a while (a 503 from Google, per model), so one can be named.
    build: ({ write, prompt, model }) => ({ args: ['--print', prompt, '--mode', write ? 'accept-edits' : 'plan'].concat(model ? ['--model', model] : []), stdin: false }),
  },
}

function onPath(bin, env) {
  const e = env || process.env
  const dirs = String(e.PATH || e.Path || '').split(path.delimiter).filter(Boolean)
  const exts = WIN ? ['', '.exe', '.cmd', '.bat'] : ['']
  return dirs.some((d) => exts.some((x) => fs.existsSync(path.join(d, bin + x))))
}

function available(hosts) {
  return Object.entries(hosts || HOSTS).map(([name, spec]) => ({ name, found: onPath(spec.bin) }))
}

// The model to pass when the caller named none: GODKIT_<HOST>_MODEL, else "models" in godkit's config.
function defaultModel(host) {
  const fromEnv = process.env['GODKIT_' + String(host).toUpperCase() + '_MODEL']
  if (fromEnv) return fromEnv
  try {
    const lazy = require('./lazy')
    const models = lazy.readConfigRecord(lazy.configPath()).value.models
    return models && typeof models[host] === 'string' ? models[host] : undefined
  } catch {
    return undefined
  }
}

// The common core. opts: { host, prompt, write, cwd, timeoutMs, hosts, model, effort, tools, depth, env }
function execute(opts) {
  const table = opts.hosts || HOSTS
  const spec = table[opts.host]
  if (!spec) throw new Error('unknown host "' + opts.host + '"; one of: ' + Object.keys(table).join(', '))
  const outFile = path.join(os.tmpdir(), 'godkit-out-' + crypto.randomBytes(6).toString('hex') + '.txt')
  const built = spec.build({
    write: Boolean(opts.write),
    prompt: opts.prompt,
    tools: opts.tools,
    model: opts.model || (opts.hosts ? undefined : defaultModel(opts.host)),
    effort: opts.effort,
    depth: opts.depth,
    outFile,
  })
  const started = Date.now()
  // An npm shim on Windows is a .cmd file: run it through cmd.exe with a line we build ourselves,
  // which avoids the shell:true path Node now warns about.
  const viaCmd = Boolean(spec.shell) && WIN
  try {
    const run = spawnSync(viaCmd ? process.env.ComSpec || 'cmd.exe' : spec.bin, viaCmd ? ['/d', '/s', '/c', '"' + [spec.bin].concat(built.args).map(winQuote).join(' ') + '"'] : built.args, {
      cwd: opts.cwd || process.cwd(),
      input: built.stdin ? opts.prompt : undefined,
      encoding: 'utf8',
      timeout: opts.timeoutMs || 300000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      windowsVerbatimArguments: viaCmd,
      env: Object.assign({}, process.env, opts.env || {}),
    })
    const ms = Date.now() - started
    if (run.error) {
      const why = run.error.code === 'ENOENT' ? spec.bin + ' is not on PATH' : run.error.code === 'ETIMEDOUT' ? 'timed out after ' + Math.round(ms / 1000) + 's' : run.error.message
      return { ok: false, host: opts.host, ms, text: why }
    }
    let out = String(run.stdout || '').trim()
    if (built.outFile) {
      try {
        out = fs.readFileSync(outFile, 'utf8').trim() || out // the CLI's own "last message" file: the answer without the progress noise
      } catch {
        /* no file: the run did not get as far as answering */
      }
    }
    // agy exits 0 after printing "AGY_ERROR: {...}" when the API gave up (a 503, say): that is a failure.
    // It also exits 0 after "jetski: no output produced": a tool wanted a permission that headless mode
    // cannot ask for (a shell command, typically), so nothing ran. godkit does not pass
    // --dangerously-skip-permissions; the allow-rule route is up to the user (see docs/agent-portability.md).
    const agyError = opts.host === 'agy' && /^(AGY_ERROR:|jetski: no output produced)/m.test(out)
    if (agyError) return { ok: false, host: opts.host, ms, text: fitBytes(out.split(/\r?\n/).filter((l) => /^(error:|AGY_ERROR:|jetski:)/.test(l)).join('\n') || out, 1500, true) }
    if (run.status !== 0) {
      // The reason is at the end of a CLI's output, after its banner and warnings.
      return { ok: false, host: opts.host, ms, text: fitBytes(String(run.stderr || '').trim() || out || 'exit ' + run.status, 1500, true) }
    }
    return { ok: true, host: opts.host, ms, text: out ? fitBytes(out, MAX_ANSWER) : '(no output)' }
  } finally {
    fs.rmSync(outFile, { force: true })
  }
}

// opts: { host, task, write, cwd, timeoutMs, hosts (override table, for tests), model }
function delegate(opts) {
  if (!(opts.hosts || HOSTS)[opts.host]) throw new Error('unknown host "' + opts.host + '"; one of: ' + Object.keys(opts.hosts || HOSTS).join(', '))
  if (process.env.GODKIT_DELEGATE_DEPTH) throw new Error('a delegated agent cannot delegate again')
  const task = String(opts.task || '').trim()
  if (!task) throw new Error('task is empty')
  return execute(Object.assign({}, opts, { prompt: PREFIX + task, env: Object.assign({ GODKIT_DELEGATE_DEPTH: '1' }, opts.env || {}) }))
}

module.exports = { HOSTS, PREFIX, MAX_ANSWER, READ_TOOLS, available, defaultModel, execute, delegate, winQuote }
