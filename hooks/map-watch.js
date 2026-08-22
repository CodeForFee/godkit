#!/usr/bin/env node
'use strict'
// PostToolUse (Bash): after a commit or merge lands, the map may no longer describe the code.
// Says so once, and only when it is actually true — a hook that nags on every command gets
// muted, and then it is worth nothing when it matters.

const fs = require('fs')

const LANDS_A_CHANGE = /\bgit\s+(commit|merge|rebase|cherry-pick|pull|revert)\b/

function main() {
  const { readHookInput } = require('../lib/session')
  const payload = readHookInput('map-watch')
  const input = payload.tool_input || {}
  const command = input.command || input.cmd || ''
  const text = Array.isArray(command) ? command.join(' ') : String(command)
  if (!LANDS_A_CHANGE.test(text)) return

  const { containedPath, findAgentContext, paths } = require('../lib/paths')
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  const context = findAgentContext(cwd)
  if (!context.agentDir) return

  const p = paths(context.stateRoot)
  if (fs.existsSync(p.meta) && !containedPath(context.agentDir, p.meta, 'file')) return
  const { staleness, summary } = require('../lib/freshness')
  const s = staleness(context.worktreeRoot, p.meta)
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
