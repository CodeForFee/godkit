#!/usr/bin/env node
'use strict'
// SessionStart: tell the arriving agent what it is walking into.
// Injects the board, the map's freshness, and the newest log entries.
//
// A hook that throws breaks the session it was meant to help, so this one never throws and
// always exits 0. Missing git, missing .agent/, malformed stdin: all produce output or silence,
// never a crash.

const fs = require('fs')
const path = require('path')

const MAX_BRIEF = 8000 // the board is one screen by design; this is the backstop, not the budget

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim()
  } catch {
    return null
  }
}

function main() {
  const { findAgentDir, logEntries, paths } = require('../lib/paths')
  const payload = readStdin()
  const cwd = payload.cwd || process.cwd()
  const agentDir = findAgentDir(cwd)

  if (!agentDir) {
    process.stdout.write(
      'No .agent/ directory in this repo. Several agents share this project, so before your ' +
        'first edit run `godkit init` (or load the godkit-handoff skill and create it by hand). ' +
        'Until it exists, nothing you do is visible to the next agent.\n',
    )
    return
  }

  const root = path.dirname(agentDir)
  const p = paths(root)
  const parts = ['## Handoff (.agent/) — read before editing, log before finishing']

  const board = read(p.board)
  if (board) parts.push('### BOARD.md\n' + board)

  // Freshness is git-only and costs nothing, but it is the difference between trusting the map
  // and being misled by it.
  try {
    const { staleness, summary } = require('../lib/freshness')
    const s = staleness(root, p.meta)
    let line = '### MAP.md — ' + summary(s)
    if (s.state === 'stale' && s.changed.length) {
      line += '\nChanged since the map was built: ' + s.changed.slice(0, 10).join(', ')
      if (s.changed.length > 10) line += ' …+' + (s.changed.length - 10) + ' more'
      line += '\nRefresh it with the godkit-map skill before relying on the map.'
    }
    parts.push(line)
  } catch {
    /* freshness is a nicety; never let it cost the brief */
  }

  for (const entry of logEntries(agentDir).slice(0, 2)) {
    parts.push('### log/' + path.basename(entry) + '\n' + (read(entry) || ''))
  }

  const thread = read(p.thread)
  if (thread) {
    // Only the tail matters: the thread is append-only and grows without bound.
    const tail = thread.split('\n').slice(-25).join('\n')
    parts.push('### THREAD.md (tail)\n' + tail)
  }

  parts.push(
    'Claim your scope on the board before you edit. If your files overlap an open claim, do not ' +
      'edit them. Write your log entry before this session ends.',
  )

  let brief = parts.join('\n\n')
  if (brief.length > MAX_BRIEF) {
    brief = brief.slice(0, MAX_BRIEF) + '\n…(truncated, read .agent/ directly)'
  }
  process.stdout.write(brief + '\n')
}

try {
  main()
} catch (err) {
  process.stderr.write('godkit brief: ' + (err && err.message) + '\n')
}
process.exit(0)
