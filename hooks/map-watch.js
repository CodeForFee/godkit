#!/usr/bin/env node
'use strict'
// PostToolUse (Bash): after a commit or merge lands, the map may no longer describe the code.
// Says so once, and only when it is actually true — a hook that nags on every command gets
// muted, and then it is worth nothing when it matters.

const fs = require('fs')
const path = require('path')

const LANDS_A_CHANGE = /\bgit\s+(commit|merge|rebase|cherry-pick|pull|revert)\b/

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}

function main() {
  const payload = readStdin()
  const command = (payload.tool_input && payload.tool_input.command) || ''
  if (!LANDS_A_CHANGE.test(command)) return

  const { findAgentDir, paths } = require('../lib/paths')
  const agentDir = findAgentDir(payload.cwd || process.cwd())
  if (!agentDir) return

  const root = path.dirname(agentDir)
  const { staleness, summary } = require('../lib/freshness')
  const s = staleness(root, paths(root).meta)
  if (s.state !== 'stale' && s.state !== 'unbuilt') return

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          'godkit: ' + summary(s) + '. The project map in .agent/MAP.md no longer matches the ' +
          'code. Refresh it with the godkit-map skill before another agent trusts it.',
      },
    }) + '\n',
  )
}

try {
  main()
} catch (err) {
  process.stderr.write('godkit map-watch: ' + (err && err.message) + '\n')
}
process.exit(0)
