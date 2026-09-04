#!/usr/bin/env node
'use strict'
// SessionStart: inject a bounded, no-follow view of the canonical shared state. Every content
// section has its own byte budget so a large BOARD can never starve MAP, logs, THREAD, or reminder.

const fs = require('fs')
const path = require('path')

const MAX_BRIEF = 8 * 1024
const RESERVED = 600
const LIMITS = {
  board: 2560,
  map: 800,
  skills: 800,
  log: 900,
  thread: 700,
}

const REMINDER =
'Claim your scope on the board before you edit. If your files overlap an open claim, do not ' +
'edit them. Sign the claim and your log with the MODEL you are running as (claude-opus-5, ' +
'claude-sonnet-5, claude-opus-4.8, claude-opus-4.7, claude-opus-4.6, claude-sonnet-4.6, ' +
'claude-fable-5, codex-5.6-sol, codex-5.6-terra, codex-5.6-luna, codex-5.5, gemini-3.8-flash, ' +
'gemini-3.7-flash, gemini-3.6-pro, gemini-3.1) — not the tool name. Write your exact-session log ' +
'entry before this session ends.'

function clippedRead(agentDir, file, limit, tail) {
  const { fitBytes, readContained } = require('../lib/paths')
  const result = readContained(agentDir, file, limit, tail)
  if (!result) return null
  let text = result.text.trim()
  if (result.truncated) text = tail ? '…\n' + text : text + '\n…'
  return fitBytes(text, limit, tail)
}

function field(body, name) {
  const frontmatter = String(body || '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatter) return null
  const match = frontmatter[1].match(new RegExp('^' + name + ':\\s*(.+)$', 'mi'))
  return match ? match[1].trim() : null
}

function skillsSummary(agentDir, p) {
  const { containedEntries, fitBytes, readContained } = require('../lib/paths')
  const generated = clippedRead(agentDir, p.skillsDoc, LIMITS.skills, false)
  if (generated) return generated

  const lines = []
  for (const entry of containedEntries(agentDir, p.skills, 64)) {
    if (!entry.isDirectory || entry.name.startsWith('.')) continue
    const skillFile = path.join(entry.path, 'SKILL.md')
    const body = readContained(agentDir, skillFile, 2048, false)
    if (!body) continue
    const origin = field(body.text, 'origin') || 'authored'
    const enabled = field(body.text, 'enabled')
    lines.push('- ' + entry.name.replace(/[\r\n]/g, '-') + ' (' + origin + (enabled === 'false' ? ', disabled' : '') + ')')
  }
  if (!lines.length) return '(none recorded)'
  lines.push('List any project skill you use in your log\'s `skills:` frontmatter.')
  return fitBytes(lines.join('\n'), LIMITS.skills)
}

function mapSummary(context, p) {
  const { containedPath, fitBytes } = require('../lib/paths')
  const lines = []
  try {
    const metaExists = fs.existsSync(p.meta)
    if (!metaExists || containedPath(context.agentDir, p.meta, 'file')) {
      const { staleness, summary } = require('../lib/freshness')
      const state = staleness(context.worktreeRoot, p.meta)
      lines.push(summary(state))
      if (state.state === 'stale' && state.changed.length) {
        lines.push('Changed: ' + state.changed.slice(0, 10).join(', '))
        lines.push('Refresh with godkit-map before relying on this map.')
      }
    } else {
      lines.push('map freshness unavailable: unsafe .agent/meta.json was ignored')
    }
  } catch (error) {
    lines.push('map freshness unavailable: ' + error.message)
  }

  const map = clippedRead(context.agentDir, p.map, LIMITS.map, false)
  if (map) lines.push(map)
  else lines.push('(MAP.md missing or unsafe)')
  return fitBytes(lines.join('\n'), LIMITS.map)
}

function section(title, content) {
  return '### ' + title + '\n' + (content || '(missing)')
}

function main() {
  const { findAgentContext, fitBytes, logEntries, paths } = require('../lib/paths')
  const { readHookInput } = require('../lib/session')
  const payload = readHookInput('brief')
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  const context = findAgentContext(cwd)

  if (!context.agentDir) {
    process.stdout.write(
      'No .agent/ directory in this repo. Several agents share this project, so before ' +
        'your first edit run `godkit init` (or load godkit-handoff and create it by hand). Until ' +
        'it exists, nothing you do is visible to the next agent.\n',
    )
    return
  }

  const p = paths(context.stateRoot)
  const parts = ['## Handoff (.agent/) — read before editing, log before finishing']
  parts.push(section('BOARD.md', clippedRead(context.agentDir, p.board, LIMITS.board, false)))
  parts.push(section('MAP.md', mapSummary(context, p)))
  parts.push(section('Project skills (.agent/skills/)', skillsSummary(context.agentDir, p)))

  const logs = logEntries(context.agentDir).slice(0, 2)
  if (!logs.length) parts.push(section('Recent logs', '(none recorded)'))
  for (const entry of logs) {
    const name = fitBytes(path.basename(entry).replace(/[\r\n]/g, '-'), 48)
    parts.push(section('log/' + name, clippedRead(context.agentDir, entry, LIMITS.log, false)))
  }

  parts.push(section('THREAD.md (tail)', clippedRead(context.agentDir, p.thread, LIMITS.thread, true)))

  let body = parts.join('\n\n')
  const bodyBudget = MAX_BRIEF - Buffer.byteLength(REMINDER, 'utf8') - 3
  if (Buffer.byteLength(body, 'utf8') > bodyBudget) body = fitBytes(body, bodyBudget)
  const brief = body + '\n\n' + REMINDER + '\n'

  // The per-section limits leave at least RESERVED bytes for headings and the final reminder.
  if (Buffer.byteLength(brief, 'utf8') > MAX_BRIEF) {
    throw new Error('brief budget invariant exceeded (' + RESERVED + ' reserved bytes)')
  }
  process.stdout.write(brief)
}

try {
  main()
} catch (error) {
  process.stderr.write('godkit brief: ' + (error && error.message) + '\n')
}
process.exit(0)
