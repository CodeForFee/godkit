#!/usr/bin/env node
'use strict'
// Stop: a session with recorded project work keeps blocking until its own handoff log exists.
// Unrelated dirty files and unrelated sessions are never evidence for or against this session.

const path = require('path')

const { findAgentContext, logEntries, logName, readContained, sessionSlug } = require('../lib/paths')
const { readHookInput, sessionId, warning } = require('../lib/session')
const { checkLog, parseFrontmatter } = require('../lib/contract')
const { clearWork, didSessionWork } = require('../lib/work')

function frontmatterSession(agentDir, file) {
  const result = readContained(agentDir, file, 4096, false)
  if (!result) return null
  return parseFrontmatter(result.text).session || null
}

// The path, not a boolean: the log has to be read again to see whether it proves anything.
function sessionLog(agentDir, sid) {
  const short = sessionSlug(sid)
  for (const file of logEntries(agentDir)) {
    const base = path.basename(file)
    if (short && base.endsWith('-' + short + '.md')) return file
    const logged = frontmatterSession(agentDir, file)
    if (logged === sid || (short && logged === short)) return file
  }
  return null
}

// Housekeeping after a verified clock-out, so nobody has to remember it: move finished items out of
// the files every session reads, refresh .agent/SKILLS.md for hosts with no hooks, and link any new
// project skill the safety scan passes. Each step is independent and none may fail the hook.
function maintain(root) {
  const fs = require('fs')
  const { paths } = require('../lib/paths')
  try {
    require('../lib/memory').archive(root)
  } catch (error) {
    warning('clockout archive', error)
  }
  try {
    const evolve = require('../lib/evolve')
    const rep = evolve.report(root)
    if (rep.skills.length || rep.candidates.length) {
      const file = paths(root).skillsDoc
      const next = evolve.renderSkillsDoc(root, rep)
      let prev = null
      try {
        prev = fs.readFileSync(file, 'utf8')
      } catch {
        /* first write */
      }
      const stamp = (s) => String(s).replace(/\*\*Generated:\*\* \S+/, '')
      if (prev === null || stamp(prev) !== stamp(next)) require('../lib/graph').atomicWriteFile(file, next)
    }
    if (rep.skills.some((r) => !r.linked.length && !evolve.blocked(r.findings))) evolve.linkProjectSkills(root)
  } catch (error) {
    warning('clockout evolve', error)
  }
}

function main() {
  const payload = readHookInput('clockout')
  if (payload.stop_hook_active) return // already blocked once this turn; blocking again loops forever
  const sid = sessionId(payload)
  if (!sid) throw new Error('missing session_id; clockout enforcement skipped')
  if (!didSessionWork(payload)) return

  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  const context = findAgentContext(cwd)
  if (!context.agentDir) return

  const written = sessionLog(context.agentDir, sid)
  if (written) {
    // One check, not the whole contract: a log claiming `done` with nothing under ## Verified.
    // Everything else `godkit verify` reports stays advisory — a Stop hook must not become a wall.
    const unproven = checkLog(context.agentDir, written).find((f) => f.tag === 'no-verify')
    if (!unproven) {
      clearWork(payload)
      maintain(context.stateRoot)
      return
    }
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason:
          'Your handoff log claims status: done but ## Verified is empty. Put the command you ' +
          'actually ran and its real output in .agent/log/' + path.basename(written) + ', or set ' +
          'status: partial and say what is left under Left / next. A passing return value is not ' +
          'evidence — see godkit-test. `godkit verify` shows every task and log this covers.',
      }) + '\n',
    )
    return
  }

  // The filename carries the model, so the placeholder stays a placeholder: only the model knows
  // which model it is, and guessing it here is how 'claude' ended up in every historical log.
  // Built by hand: logName() sanitizes '<' and '>' to '-', and agents that replaced the inner text
  // left '--model--' filenames behind.
  const name = logName('MODEL', sid).replace('-MODEL', '-<your-model-id>')
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        'Clock out first: this session changed project files but has no exact-session handoff log. ' +
        'Write .agent/log/' + name + ' (agent, session, scope, status, then Did / Verified / Bugs / ' +
        'Decisions / Left-next), then update .agent/BOARD.md and THREAD if another agent is ' +
        'waiting. Replace <your-model-id> and the `agent:` field with the model you are running ' +
        'as (e.g. claude-opus-5, codex-5.6-terra, gemini-3.6-pro) — never the tool name. This ' +
        'check repeats until that log exists; see godkit-handoff.',
    }) + '\n',
  )
}

try {
  main()
} catch (error) {
  warning('clockout', error)
}
process.exit(0)
