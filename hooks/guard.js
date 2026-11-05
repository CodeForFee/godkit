#!/usr/bin/env node
'use strict'
// PreToolUse: stop what no task justifies (lib/guard.js), and stop two agents sharing a file.
//
//   command   force push, reset --hard, rm -r on a root, curl | sh ...   -> deny
//   file      .git/, .env, credentials, shell startup files             -> deny
//   claim     file inside a live claim tagged with ANOTHER session        -> deny
//             file inside a live claim with no tag (cannot tell whose)    -> a note, once
//   plan      file in the scope of YOUR task while that task is still in phase plan -> deny
//             ("your task" = owner matches a claim tagged with this session)
//
// A claim carries its holder's session slug, "claude-opus-5 (9fe96f63)", when it was made through
// the godkit MCP tool or CLI. Untagged claims (written by hand) are not enough to block anyone: the
// hook cannot know whether the claim is the editor's own, and a false deny on an agent's own files is
// worse than the collision it would prevent. The pre-commit check is the backstop for those.
//
// GODKIT_GUARD=off turns it off. Silence means "no opinion", so every other permission rule applies.
// Never throws, always exits 0.

const fs = require('fs')
const path = require('path')

const { checkCommand, checkPath } = require('../lib/guard')
const { baseOf, covers, isOpen, readClaims, tagOf } = require('../lib/board')
const { parseFrontmatter, taskEntries } = require('../lib/contract')
const { findAgentContext, isInside, paths, readContained, sessionSlug } = require('../lib/paths')
const { readHookInput, readState, sessionId, warning, writeState } = require('../lib/session')
const { editPaths } = require('../lib/work')

const EDIT_TOOLS = new Set(['edit', 'write', 'multiedit', 'notebookedit', 'apply_patch'])
const SEEN = 'guard-seen.json'

function say(body) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: Object.assign({ hookEventName: 'PreToolUse' }, body) }) + '\n')
}

const deny = (reason) => say({ permissionDecision: 'deny', permissionDecisionReason: 'godkit guard: ' + reason })

function liveClaims(context) {
  try {
    return readClaims(fs.readFileSync(paths(context.stateRoot).board, 'utf8')).filter((r) => isOpen(r))
  } catch {
    return []
  }
}

// Returns a reason to deny, a note to pass on, or nothing.
function claimVerdict(payload, context, file) {
  const abs = path.isAbsolute(file) ? path.resolve(file) : path.resolve(payload.cwd || context.worktreeRoot, file)
  if (!isInside(context.worktreeRoot, abs)) return null
  const rel = path.relative(context.worktreeRoot, abs).replace(/\\/g, '/')
  if (rel.startsWith('.agent/')) return null
  const mine = sessionSlug(sessionId(payload)).toLowerCase()
  for (const row of liveClaims(context)) {
    if (!covers(row.scope, rel)) continue
    const tag = tagOf(row.agent)
    if (tag && tag === mine) return null
    const who = baseOf(row.agent) + (tag ? ' (' + tag + ')' : '')
    if (tag) {
      return { deny: rel + ' is inside ' + who + '\'s open claim (' + row.scope + '). Take another seam, or ask the user to release it.' }
    }
    return { note: rel + ' is inside an open claim by ' + who + ' (' + row.scope + '). If that claim is not yours, take another seam; if it is, carry on.' }
  }
  return null
}

// Plan mode, as far as a hook can do it: the one thing in godkit that says "not yet" is a task whose
// phase is still plan. It binds only the session that owns the task (a claim tagged with this
// session, same model id as the task's owner) and only for files in that task's scope, so an old
// task left in plan by an earlier session of the same model can't block unrelated work.
function planGate(payload, context, files) {
  const mine = sessionSlug(sessionId(payload)).toLowerCase()
  const owners = new Set(liveClaims(context).filter((r) => tagOf(r.agent) === mine).map((r) => baseOf(r.agent)))
  if (!mine || !owners.size) return null
  const agentDir = paths(context.stateRoot).dir
  for (const file of taskEntries(agentDir)) {
    const read = readContained(agentDir, file, 16 * 1024, false)
    const task = parseFrontmatter(read ? read.text : '')
    if (!owners.has(task.owner) || !/^plan/i.test(task.phase || '') || !task.scope) continue
    for (const f of files) {
      const abs = path.isAbsolute(f) ? path.resolve(f) : path.resolve(payload.cwd || context.worktreeRoot, f)
      if (!isInside(context.worktreeRoot, abs)) continue
      const rel = path.relative(context.worktreeRoot, abs).replace(/\\/g, '/')
      if (rel.startsWith('.agent/') || !covers(task.scope, rel)) continue
      return task.id + ' (' + path.basename(file) + ') is still in phase plan, so ' + rel + ' is not yours to edit yet. Write its Plan section and the exit condition, then set phase: execute.'
    }
  }
  return null
}

function main() {
  if (/^(off|0|false)$/i.test(process.env.GODKIT_GUARD || '')) return
  const payload = readHookInput('guard')
  const tool = String(payload.tool_name || '').toLowerCase()
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {}

  if (tool === 'bash') {
    const reason = checkCommand(input.command || input.cmd)
    if (reason) deny(reason)
    return
  }
  if (!EDIT_TOOLS.has(tool)) return

  const files = editPaths(payload)
  for (const file of files) {
    const reason = checkPath(file, payload.cwd)
    if (reason) return deny(reason)
  }

  const context = findAgentContext(typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd())
  if (!context.agentDir) return
  const notes = []
  for (const file of files) {
    const verdict = claimVerdict(payload, context, file)
    if (verdict && verdict.deny) return deny(verdict.deny)
    if (verdict && verdict.note) notes.push(verdict.note)
  }
  const gate = planGate(payload, context, files)
  if (gate) return deny(gate)
  if (!notes.length) return

  // One note per claim per session; repeating it on every edit would train the agent to ignore it.
  let seen = []
  try {
    const state = readState('work', payload, SEEN)
    seen = state && Array.isArray(state.notes) ? state.notes : []
  } catch {
    /* no session id: say it once per call, harmless */
  }
  const fresh = notes.filter((n) => !seen.includes(n))
  if (!fresh.length) return
  try {
    writeState('work', payload, { notes: seen.concat(fresh).slice(-50) }, SEEN)
  } catch {
    /* best effort */
  }
  say({ additionalContext: 'godkit guard: ' + fresh.join(' ') })
}

try {
  main()
} catch (error) {
  warning('guard', error)
}
process.exit(0)
