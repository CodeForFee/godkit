#!/usr/bin/env node
'use strict'
// Cursor and Antigravity call hooks with their own field names and expect their own output keys.
// Our scripts speak the Claude Code dialect, so this sits between: it translates the host's input
// into that dialect, runs the HOOKS rows (lib/install.js) for the event, and translates what they
// print back. `godkit hooks install` registers it:  node adapt.js <cursor|antigravity> <host event>
//
// PreToolUse needs a permission verdict from the host. Antigravity documents `allow` as "delegate to
// the next hook or the default policy", so it gets the full set. Cursor documents no neutral answer, so
// it gets beforeShellExecution only, filtered to commands the guard can deny (see lib/install.js), and a
// match that passes is answered `ask`: at worst one extra prompt, never one fewer. Because Cursor has
// no PreToolUse on every tool, work-track cannot take its before-snapshot there, and a change made
// only by a shell command goes unseen; direct edits, SessionStart and Stop are covered.
//
// A hook that throws breaks the session it was meant to help: this never throws and exits 0.

const { spawnSync } = require('child_process')
const path = require('path')

const { adaptedRows } = require('../lib/install')
const { readHookInput, readState, warning, writeState } = require('../lib/session')

// Clockout may ask for a log this many times in a row, then lets the host stop. Cursor has its own
// loop_limit; Antigravity documents none, so the cap lives here for both.
const MAX_STOP_BLOCKS = 3
const STOP_STATE = 'adapt-stop.json'

const HOSTS = {
  cursor: {
    events: { sessionStart: 'SessionStart', beforeShellExecution: 'PreToolUse', postToolUse: 'PostToolUse', stop: 'Stop', sessionEnd: 'SessionEnd' },
    tools: { Shell: 'Bash', Write: 'Write', Delete: 'Edit' },
  },
  antigravity: {
    events: { SessionStart: 'SessionStart', PreToolUse: 'PreToolUse', PostToolUse: 'PostToolUse', Stop: 'Stop' },
    // Names from Antigravity's hooks docs; anything unknown passes through unmapped.
    tools: { run_command: 'Bash', write_to_file: 'Write', replace_file_content: 'Edit', multi_replace_file_content: 'Edit' },
  },
}

const strip = (p) => (typeof p === 'string' ? p.replace(/^\/([a-zA-Z]:)/, '$1') : undefined)
const first = (list) => (Array.isArray(list) ? strip(list[0]) : undefined)
const pick = (obj, keys) => {
  for (const key of keys) if (obj && typeof obj[key] === 'string' && obj[key]) return obj[key]
  return undefined
}

function toolInput(args) {
  const input = Object.assign({}, args && typeof args === 'object' ? args : {})
  const command = pick(input, ['command', 'CommandLine'])
  if (command) input.command = command
  const file = pick(input, ['file_path', 'path', 'filePath', 'TargetFile', 'AbsolutePath'])
  if (file) input.file_path = file
  return input
}

// Host input -> { event, payload } in the shape our scripts read; null when the event should not
// be acted on (a stop the host did not reach normally).
function normalize(host, hostEvent, input) {
  const spec = HOSTS[host]
  const event = spec && spec.events[hostEvent]
  if (!event) return null
  const cursor = host === 'cursor'
  const payload = {
    hook_event_name: event,
    session_id: cursor ? input.conversation_id || input.session_id : input.conversationId,
    transcript_path: cursor ? input.transcript_path : input.transcriptPath,
    cwd: strip(input.cwd) || first(cursor ? input.workspace_roots : input.workspacePaths),
  }
  // Neither host says why a session started, and compaction is invisible to both.
  if (event === 'SessionStart') payload.source = 'startup'
  if (event === 'PreToolUse' || event === 'PostToolUse') {
    const call = !cursor ? input.toolCall || {} : hostEvent === 'beforeShellExecution' ? { name: 'Shell', args: { command: input.command } } : { name: input.tool_name, args: input.tool_input }
    payload.tool_name = spec.tools[call.name] || call.name
    payload.tool_input = toolInput(call.args)
    // Antigravity has no call id; its step index is unique within a conversation.
    payload.tool_use_id = cursor ? input.tool_use_id : 'step-' + input.stepIdx // PreToolUse and PostToolUse of one call share it
    if (!cursor && input.error) payload.tool_response = { error: input.error }
  }
  if (event === 'Stop') {
    const finished = cursor ? input.status === 'completed' : !input.terminationReason || input.terminationReason === 'model_stop'
    if (!finished) return null
  }
  return { event, payload }
}

function selectRows(host, event, payload) {
  const subject = (event === 'SessionStart' ? payload.source : payload.tool_name) || ''
  return adaptedRows(event, host).filter(([, , matcher]) => !matcher || new RegExp('^(?:' + matcher + ')$').test(subject))
}

// What a script printed, as { context } or { block }. Claude-dialect scripts print raw text
// (SessionStart) or JSON; both are accepted.
function readOutput(stdout) {
  const text = String(stdout || '').trim()
  if (!text) return {}
  if (text[0] === '{') {
    try {
      const value = JSON.parse(text)
      if (value.decision === 'block') return { block: String(value.reason || '') }
      const hso = value.hookSpecificOutput || {}
      if (hso.permissionDecision === 'deny') return { deny: String(hso.permissionDecisionReason || 'blocked by godkit guard') }
      const context = value.hookSpecificOutput && value.hookSpecificOutput.additionalContext
      return context ? { context: String(context) } : {}
    } catch {
      /* plain text that happens to start with a brace */
    }
  }
  return { context: text }
}

function runRows(rows, payload) {
  const outputs = []
  for (const [, script, , argv, timeout] of rows) {
    const run = spawnSync(process.execPath, [path.join(__dirname, script), ...argv], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: timeout * 1000,
      windowsHide: true,
    })
    if (run.error) warning('adapt ' + script, run.error)
    outputs.push(readOutput(run.stdout))
  }
  return {
    context: outputs.map((o) => o.context).filter(Boolean).join('\n\n'),
    block: (outputs.find((o) => o.block) || {}).block || '',
    deny: (outputs.find((o) => o.deny) || {}).deny || '',
  }
}

function stopBlocks(payload) {
  try {
    const state = readState('work', payload, STOP_STATE)
    return state ? Number(state.blocks) || 0 : 0
  } catch {
    return 0
  }
}

// { context, block } -> what the host expects back. Tool and stop events always answer, because a
// missing or malformed answer is read by the host as an error.
function translate(host, event, result) {
  const { context, block, deny } = result
  if (host === 'cursor') {
    if (event === 'PreToolUse') return deny ? { permission: 'deny', user_message: deny, agent_message: deny } : { permission: 'ask' }
    if (event === 'SessionStart' || event === 'PostToolUse') return context ? { additional_context: context } : {}
    if (event === 'Stop') return block ? { followup_message: block } : {}
    return {}
  }
  if (event === 'PreToolUse') return deny ? { decision: 'deny', reason: deny } : { decision: 'allow' }
  if (event === 'SessionStart') return context ? { injectSteps: [{ systemMessage: { systemMessage: context } }] } : {}
  if (event === 'Stop') return block ? { decision: 'continue', reason: block } : { decision: 'stop' }
  return {}
}

function main() {
  const [host, hostEvent] = process.argv.slice(2)
  const spec = HOSTS[host]
  if (!spec) return
  const event = spec.events[hostEvent]
  const input = readHookInput('adapt')
  let result = { context: '', block: '', deny: '' }
  try {
    const normalized = normalize(host, hostEvent, input)
    if (normalized) {
      const { payload } = normalized
      const skip = event === 'Stop' && stopBlocks(payload) >= MAX_STOP_BLOCKS
      result = runRows(skip ? [] : selectRows(host, event, payload), payload)
      if (event === 'Stop' && result.block) {
        try {
          writeState('work', payload, { blocks: stopBlocks(payload) + 1 }, STOP_STATE)
        } catch (error) {
          warning('adapt', error)
        }
      }
    }
  } catch (error) {
    warning('adapt', error)
  }
  process.stdout.write(JSON.stringify(translate(host, event, result)) + '\n')
}

module.exports = { HOSTS, MAX_STOP_BLOCKS, normalize, readOutput, selectRows, translate }

if (require.main === module) {
  try {
    main()
  } catch (error) {
    warning('adapt', error)
  }
  process.exit(0)
}
