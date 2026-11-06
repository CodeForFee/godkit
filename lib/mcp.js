'use strict'
// godkit as an MCP server over stdio (`godkit mcp`). Claude Code, Codex, Cursor and Antigravity all
// speak MCP, so this is the one way to give every host the same protocol — claim, log, recall, map,
// verify — as tools with checked input, instead of asking each agent to hand-edit Markdown tables.
// It also works where hooks do not (Cursor's cloud agents, other IDEs).
//
// godkit: newline-delimited JSON-RPC written by hand (about the whole of the stdio transport); no
// SDK. HTTP transport, OAuth, progress and cancellation are not here — add the SDK if one is needed.
// Nothing but protocol messages may go to stdout.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const board = require('./board')
const { checkAll } = require('./contract')
const delegation = require('./delegate')
const subagents = require('./subagent')
const jobs = require('./jobs')
const team = require('./team')
const { loadGraph } = require('./graph')
const { recall } = require('./memory')
const { findAgentContext, logName, paths, utcStamp } = require('./paths')

const ROOT = path.resolve(__dirname, '..')
const SKILLS = path.join(ROOT, 'skills')
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']

// `godkit verify` rejects a bare tool name as an agent; refuse it at the door instead of at the audit.
const TOOL_NAMES = /^(claude|codex|cursor|antigravity|gemini|copilot|windsurf)$/i

const str = (description, extra) => Object.assign({ type: 'string', description }, extra)
const CWD = str('Project folder. Defaults to the server\'s working directory.')

function projectOf(args) {
  const cwd = typeof args.cwd === 'string' && args.cwd ? args.cwd : process.cwd()
  const context = findAgentContext(cwd)
  if (!context.agentDir) throw new Error('no .agent/ at ' + cwd + ' — run `godkit init` there first')
  return { root: context.stateRoot, cwd }
}

function text(value, isError) {
  return { content: [{ type: 'text', text: String(value) }], isError: Boolean(isError) }
}

const TOOLS = [
  {
    name: 'godkit_brief',
    description: 'The session brief: live claims, open bugs, decisions, newest logs, whether the map is stale. Call it first, and again after the host compacts the conversation.',
    inputSchema: { type: 'object', properties: { cwd: CWD, session: str('Your session id, if you know it.') } },
    run(args) {
      const { cwd } = projectOf(args)
      const run = spawnSync(process.execPath, [path.join(ROOT, 'hooks', 'brief.js')], {
        input: JSON.stringify({ cwd, session_id: args.session }),
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
      })
      return text(run.stdout || 'no brief')
    },
  },
  {
    name: 'godkit_claim',
    description: 'Claim file globs before you edit them. Refused when a live claim by another agent overlaps. Pass your session id so the claim is recognised as yours and others are blocked from editing it.',
    inputSchema: {
      type: 'object',
      required: ['agent', 'scope', 'task'],
      properties: {
        agent: str('Your model id, e.g. claude-opus-5. Letters, digits, dot, dash.'),
        scope: str('File globs, space separated: "lib/auth/* tests/auth.test.js".'),
        task: str('One line: what you are doing.'),
        session: str('Your session id (first 8 characters are used as your claim tag).'),
        cwd: CWD,
      },
    },
    run(args) {
      const { root } = projectOf(args)
      if (TOOL_NAMES.test(args.agent || '')) throw new Error('agent must be a model id like claude-opus-5, not a tool name')
      const result = board.updateBoard(root, (raw) => board.addClaim(raw, args))
      if (result.conflict) {
        const c = result.conflict
        return text('Refused: ' + c.agent + ' holds ' + c.scope + ' since ' + c.since + ' (' + c.task + '). Take another seam, or wait until it is released or goes stale after ' + board.STALE_HOURS + 'h.', true)
      }
      return text('Claimed. ' + result.claim)
    },
  },
  {
    name: 'godkit_release',
    description: 'Release your claim when you are done, or before you hand the files to someone else.',
    inputSchema: {
      type: 'object',
      required: ['agent'],
      properties: { agent: str('The agent id you claimed with.'), scope: str('Release only the claim with exactly this scope.'), cwd: CWD },
    },
    run(args) {
      const { root } = projectOf(args)
      const result = board.updateBoard(root, (raw) => board.releaseClaim(raw, args))
      return text(result.removed ? 'Released ' + result.removed + ' claim(s).' : 'No claim by ' + args.agent + ' to release.')
    },
  },
  {
    name: 'godkit_log',
    description: 'Write your handoff log for this session. status "done" needs a non-empty verified (the command you ran and its deciding output).',
    inputSchema: {
      type: 'object',
      required: ['agent', 'session', 'task', 'did', 'status'],
      properties: {
        agent: str('Your model id, never the tool name.'),
        session: str('Your session id; its first 8 characters go in the filename.'),
        task: str('One line.'),
        did: str('What changed, with real paths.'),
        status: str('done, partial or blocked.', { enum: ['done', 'partial', 'blocked'] }),
        verified: str('Command run and the lines that decide it. Required for done.'),
        scope: str('File globs you touched.'),
        bugs: str('fixed/found B-nnn lines.'),
        decisions: str('What was decided, and why.'),
        next: str('What you did not do. Required for partial or blocked.'),
        cwd: CWD,
      },
    },
    run(args) {
      const { root } = projectOf(args)
      const need = (k) => typeof args[k] === 'string' && args[k].trim()
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(args.agent || '') || TOOL_NAMES.test(args.agent)) throw new Error('agent must be a model id like claude-opus-5, not a tool name')
      if (!/^[A-Za-z0-9_-]{4,128}$/.test(args.session || '')) throw new Error('session must be at least 4 letters, digits, dash or underscore')
      if (!need('task') || !need('did')) throw new Error('task and did are required')
      if (!['done', 'partial', 'blocked'].includes(args.status)) throw new Error('status must be done, partial or blocked')
      if (args.status === 'done' && !need('verified')) throw new Error('status done needs verified: the command you ran and its output')
      if (args.status !== 'done' && !need('next')) throw new Error('status ' + args.status + ' needs next: what is left')
      const now = utcStamp()
      const q = (v) => JSON.stringify(String(v || '').replace(/[\r\n]+/g, ' '))
      const body = [
        '---', 'agent: ' + q(args.agent), 'session: ' + q(args.session), 'started: ' + q(now), 'ended: ' + q(now),
        'scope: ' + q(args.scope), 'status: ' + q(args.status), 'skills: ""', '---', '',
        '## Task', '', args.task.trim(), '',
        '## Did', '', args.did.trim(), '',
        '## Verified', '', (args.verified || '').trim(), '',
        '## Bugs', '', (args.bugs || '').trim(), '',
        '## Decisions', '', (args.decisions || '').trim(), '',
        '## Left / next', '', (args.next || '').trim(), '',
      ].join('\n')
      const dir = paths(root).log
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, logName(args.agent, args.session))
      fs.writeFileSync(file, body, { flag: 'wx' }) // never overwrite another session's log
      return text('Wrote .agent/log/' + path.basename(file))
    },
  },
  {
    name: 'godkit_recall',
    description: 'Search everything agents ever wrote (logs, board, thread, tasks, archive). Every word must be on the line. Bounded answer.',
    inputSchema: { type: 'object', required: ['query'], properties: { query: str('Words or a path.'), cwd: CWD } },
    run(args) {
      const { root } = projectOf(args)
      const result = recall(root, args.query)
      return text(result.text ? result.text + (result.more ? '(+' + result.more + ' more)' : '') : 'no matches')
    },
  },
  {
    name: 'godkit_map_query',
    description: 'Find files in the project map by words in their path, name, summary or tags. Use before reading source.',
    inputSchema: { type: 'object', required: ['query'], properties: { query: str('Words; all must match.'), limit: { type: 'integer', minimum: 1, maximum: 20 }, cwd: CWD } },
    run(args) {
      const { root } = projectOf(args)
      const graph = loadGraph(paths(root).graph)
      if (!graph) return text('no map yet — run the godkit-map skill', true)
      const words = String(args.query || '').toLowerCase().split(/\s+/).filter(Boolean)
      if (!words.length) throw new Error('query is empty')
      const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20)
      const hits = graph.nodes
        .filter((n) => {
          const hay = [n.filePath, n.name, n.summary, (n.tags || []).join(' ')].join(' ').toLowerCase()
          return words.every((w) => hay.includes(w))
        })
        .slice(0, limit)
      return text(hits.length ? hits.map((n) => n.filePath + (n.lineRange ? ':' + n.lineRange[0] : '') + '  ' + String(n.summary || '').slice(0, 160)).join('\n') : 'no matches')
    },
  },
  {
    name: 'godkit_delegate',
    description: 'Hand a task to another agent CLI (claude, codex, gemini, agy) running headless in its own context, and get back a short answer. Read-only unless write is true. Use it for a second opinion from a different model, or to keep a big read out of your own context. It cannot delegate again.',
    inputSchema: {
      type: 'object',
      required: ['host', 'task'],
      properties: {
        host: str('Which agent CLI.', { enum: Object.keys(delegation.HOSTS) }),
        task: str('What to do, with file paths. It sees the repo but not this conversation.'),
        write: { type: 'boolean', description: 'Allow it to edit files. Default false: read-only, enforced by that CLI.' },
        timeout: { type: 'integer', minimum: 5, maximum: 600, description: 'Seconds. Default 120; many MCP clients give up on a call sooner than a long run.' },
        cwd: CWD,
      },
    },
    run(args) {
      const { cwd } = projectOf(args)
      const result = delegation.delegate({ host: args.host, task: args.task, write: args.write === true, cwd, timeoutMs: Math.min(Math.max(Number(args.timeout) || 120, 5), 600) * 1000 })
      return text('[' + result.host + ', ' + Math.round(result.ms / 1000) + 's] ' + result.text, !result.ok)
    },
  },
  {
    name: 'godkit_agent',
    // Listed in the description, because the model chooses a tool by reading it: the agents that exist here.
    get description() {
      let names = ''
      try {
        names = subagents.listAgents(process.cwd()).map((a) => a.name + ' (' + (subagents.classify(a.def).write ? 'may write' : 'read-only') + '): ' + a.description.slice(0, 110)).join('\n')
      } catch {
        /* no list is better than a broken tool list */
      }
      return (
        'Run a named subagent: a separate agent process with its own context, and only its short report comes back. ' +
        'What it may do is fixed by its file, not by you: a read-only agent runs in a read-only sandbox, an isolated one in its own git worktree. ' +
        'Use it to keep big reads out of your context, for a review that cannot touch the code, or to try a change in isolation.\nAgents:\n' + names
      )
    },
    inputSchema: {
      type: 'object',
      required: ['name', 'task'],
      properties: {
        name: str('An agent from the list in this tool\'s description.'),
        task: str('What to do, with file paths. It does not see this conversation.'),
        host: str('Which agent CLI runs it. Default: codex if installed, else claude.', { enum: ['codex', 'claude'] }),
        model: str('Override the model.'),
        timeout: { type: 'integer', minimum: 10, maximum: 1800, description: 'Seconds. Default: the agent file\'s timeout, else 600.' },
        background: { type: 'boolean', description: 'Start it and return a job id at once, so you can start several members in parallel; collect them with godkit_jobs.' },
        cwd: CWD,
      },
    },
    run(args) {
      const { cwd } = projectOf(args)
      const o = { name: args.name, task: args.task, host: args.host, model: args.model, cwd, timeoutMs: args.timeout ? Number(args.timeout) * 1000 : undefined }
      if (args.background === true) {
        subagents.findAgent(cwd, args.name)
        const job = jobs.start('agent', o)
        return text('started ' + args.name + ' as job ' + job.id + '. Start the others, then collect all of them with godkit_jobs {"ids": [...], "wait": 120}.')
      }
      const r = subagents.runAgent(o)
      return text('[' + r.name + ' via ' + r.host + ', ' + (r.write ? (r.isolated ? 'isolated worktree' : 'may write') : 'read-only') + ', ' + Math.round(r.ms / 1000) + 's]\n' + r.text, !r.ok)
    },
  },
  {
    name: 'godkit_team',
    description:
      'Run a team of agents on a goal: a planner cuts it into file-disjoint seams, implementers build them in parallel (each in its own git worktree, merged as they finish), a tester proves it, a reviewer checks it, and failures go back to the implementers. Every member is its own agent process with the godkit skills of its role preloaded. ' +
      'It runs in the background: this returns a job id; poll godkit_jobs. The result is a branch for you to review and merge; nothing lands in your branch. The graph is in .agent/team.md, or godkit\'s default team.',
    inputSchema: {
      type: 'object',
      required: ['goal'],
      properties: {
        goal: str('What the team should achieve, with the paths and names you already know.'),
        host: str('Which agent CLI runs the members. Default: codex if installed, else claude.', { enum: ['codex', 'claude'] }),
        model: str('Override the members\' model.'),
        cwd: CWD,
      },
    },
    run(args) {
      const { cwd } = projectOf(args)
      if (!String(args.goal || '').trim()) throw new Error('goal is empty')
      team.loadTeam(cwd)
      const job = jobs.start('team', { goal: args.goal, host: args.host, model: args.model, cwd })
      return text('team started as job ' + job.id + '. It takes minutes; check with godkit_jobs {"ids": ["' + job.id + '"], "wait": 120} and keep doing other work meanwhile.')
    },
  },
  {
    name: 'godkit_jobs',
    description: 'Status and results of members and teams started in the background (godkit_agent with background, godkit_team). With "wait", block up to that many seconds for the named jobs to finish.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Job ids. Default: the 10 newest jobs, status only.' },
        wait: { type: 'integer', minimum: 0, maximum: 300, description: 'Seconds to wait for the named jobs. Default 0. Many MCP clients give up on a call after a few minutes.' },
      },
    },
    run(args) {
      const ids = Array.isArray(args.ids) ? args.ids.map(String) : []
      if (!ids.length) {
        const recent = jobs.list().slice(0, 10)
        return text(recent.length ? recent.map((j) => j.id + '  ' + j.state + '  ' + j.title).join('\n') : 'no jobs')
      }
      const found = jobs.wait(ids, Math.min(Math.max(Number(args.wait) || 0, 0), 300) * 1000)
      const out = found.map((j) => '=== ' + j.id + '  ' + j.state + (j.result ? '\n' + j.result.text : j.state === 'running' ? '\nstill running; call again with "wait"' : ''))
      return text(out.join('\n\n'), found.some((j) => j.state === 'failed' || j.state === 'lost' || j.state === 'missing'))
    },
  },
  {
    name: 'godkit_verify',
    description: 'Check that every task and log marked done has an exit and evidence. Findings are blockers.',
    inputSchema: { type: 'object', properties: { cwd: CWD } },
    run(args) {
      const { root } = projectOf(args)
      const findings = checkAll(root)
      if (!findings.length) return text('tasks: clean.')
      return text(findings.map((f) => f.label + ': ' + f.tag + ' - ' + f.message).join('\n'), true)
    },
  },
]

// --- resources: the three files every agent reads first ----------------------------------------

const RESOURCES = [
  ['godkit://board', 'board', 'BOARD.md', 'Roster, live claims, tasks, bugs and decisions.'],
  ['godkit://map', 'map', 'MAP.md', 'What this codebase is.'],
  ['godkit://thread', 'thread', 'THREAD.md', 'Messages between agents.'],
]

function resourceFile(uri) {
  const entry = RESOURCES.find((r) => r[0] === uri)
  if (!entry) return null
  const { root } = projectOf({})
  return path.join(paths(root).dir, entry[2])
}

// --- prompts: the skills, for hosts that cannot load a SKILL.md themselves ---------------------

function skillNames() {
  try {
    return fs.readdirSync(SKILLS).filter((n) => fs.existsSync(path.join(SKILLS, n, 'SKILL.md')))
  } catch {
    return []
  }
}

function skillBody(name) {
  return fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8')
}

function skillDescription(body) {
  const m = /^description:\s*(?:>-?\s*\r?\n((?:[ \t]+.*\r?\n?)+)|(.*))/m.exec(body)
  return m ? (m[1] || m[2] || '').replace(/\s+/g, ' ').trim() : ''
}

// --- JSON-RPC ----------------------------------------------------------------------------------

const fail = (id, code, message) => ({ jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } })
const ok = (id, result) => ({ jsonrpc: '2.0', id, result })

// One message in, one response out (or null for a notification). Pure apart from what tools do.
function respond(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.method !== 'string') return fail(msg && msg.id, -32600, 'invalid request')
  const { id, method } = msg
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {}
  if (id === undefined) return null // notification

  try {
    switch (method) {
      case 'initialize':
        return ok(id, {
          protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: 'godkit', version: VERSION },
          instructions: 'Shared agent memory for this repo. Call godkit_brief first, godkit_claim before you edit, godkit_log before you finish.',
        })
      case 'ping':
        return ok(id, {})
      case 'tools/list':
        return ok(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) })
      case 'tools/call': {
        const tool = TOOLS.find((t) => t.name === params.name)
        if (!tool) return fail(id, -32602, 'unknown tool: ' + params.name)
        try {
          return ok(id, tool.run(params.arguments && typeof params.arguments === 'object' ? params.arguments : {}))
        } catch (error) {
          return ok(id, text(error.message, true))
        }
      }
      case 'resources/list': {
        let live = false
        try {
          projectOf({})
          live = true
        } catch {
          /* no .agent/ here: list nothing */
        }
        return ok(id, { resources: live ? RESOURCES.map(([uri, name, , description]) => ({ uri, name, description, mimeType: 'text/markdown' })) : [] })
      }
      case 'resources/read': {
        const file = resourceFile(params.uri)
        if (!file) return fail(id, -32002, 'unknown resource: ' + params.uri)
        return ok(id, { contents: [{ uri: params.uri, mimeType: 'text/markdown', text: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' }] })
      }
      case 'prompts/list':
        return ok(id, { prompts: skillNames().map((name) => ({ name, description: skillDescription(skillBody(name)) })) })
      case 'prompts/get': {
        if (!skillNames().includes(params.name)) return fail(id, -32602, 'unknown prompt: ' + params.name)
        return ok(id, { description: skillDescription(skillBody(params.name)), messages: [{ role: 'user', content: { type: 'text', text: skillBody(params.name) } }] })
      }
      default:
        return fail(id, -32601, 'method not found: ' + method)
    }
  } catch (error) {
    return fail(id, -32603, error.message)
  }
}

function serve(input, output) {
  let buffer = ''
  input.setEncoding('utf8')
  const handle = (line) => {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      output.write(JSON.stringify(fail(null, -32700, 'parse error')) + '\n')
      return
    }
    const reply = respond(msg)
    if (reply) output.write(JSON.stringify(reply) + '\n')
  }
  input.on('data', (chunk) => {
    buffer += chunk
    let at
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at).trim()
      buffer = buffer.slice(at + 1)
      if (line) handle(line)
    }
  })
}

module.exports = { TOOLS, RESOURCES, PROTOCOLS, respond, serve }
