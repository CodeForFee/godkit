#!/usr/bin/env node
'use strict'
// lib/install.js HOOKS is the single source for both registration paths: the settings file the
// standalone installer writes, and the plugin manifest Claude Code reads. This generates the
// manifest from that list.
// Run with no flag to regenerate it; run with --check to fail if it drifted (CI).
//
// It was hand-maintained until a new hook was added to one side and not the other, which is the
// only failure mode a generated file cannot have.

const fs = require('fs')
const path = require('path')

const { HOOKS } = require('../lib/install')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'hooks', 'godkit-hooks.json')

// What the host shows while the hook runs. Cosmetic, but it is the only thing the user sees.
const STATUS = {
  'brief.js': 'Reading .agent/ handoff',
  'lazy-activate.js': 'Loading godkit-lazy mode',
  'lazy-subagent.js': 'Loading godkit-lazy mode',
  'lazy-mode-tracker.js': 'Tracking godkit-lazy mode',
  'work-track.js': 'Tracking session work',
  'map-watch.js': 'Checking map freshness',
  'clockout.js': 'Checking handoff log',
}

function build() {
  const hooks = {}
  for (const [event, script, matcher, argv, timeout] of HOOKS) {
    const command = ['node "${CLAUDE_PLUGIN_ROOT}/hooks/' + script + '"', ...argv].join(' ')
    const group = {}
    if (matcher) group.matcher = matcher
    group.hooks = [{ type: 'command', command, timeout, statusMessage: STATUS[script] || 'godkit' }]
    hooks[event] = (hooks[event] || []).concat([group])
  }
  return JSON.stringify({ hooks }, null, 2) + '\n'
}

function main() {
  const check = process.argv.includes('--check')
  const want = build()
  let have = null
  try {
    have = fs.readFileSync(TARGET, 'utf8')
  } catch {
    /* missing counts as drifted */
  }

  if (have === want) {
    console.log('plugin hook manifest: in sync')
    return
  }
  if (check) {
    console.error(
      'hooks/godkit-hooks.json is stale' + (have === null ? ' (missing)' : '') +
        '.\nRun `node scripts/sync-hooks.js` and commit the result.',
    )
    process.exit(1)
  }
  fs.writeFileSync(TARGET, want)
  console.log('wrote hooks/godkit-hooks.json')
}

module.exports = { build }

if (require.main === module) main()
