#!/usr/bin/env node
'use strict'
// Registers the godkit hooks in a Claude Code or Codex settings file, with paths derived from
// where this file actually lives — nothing to hand-edit, and moving the package is a re-run
// rather than a text hunt.
//
//   node install.js                → ~/.claude/settings.json
//   node install.js <path>         → that settings file instead
//   node install.js --uninstall
//
// Re-running is safe: our own registrations are dropped and re-added, so a stale path from an
// earlier location cannot survive. Other tools' hooks in the same file are left untouched.

const fs = require('fs')
const os = require('os')
const path = require('path')

const HOOKS = [
  ['SessionStart', 'brief.js', null],
  ['Stop', 'clockout.js', null],
  ['PostToolUse', 'map-watch.js', 'Bash'],
]

// Recognize our own entries by the hook script paths, NOT by the package name: the directory
// godkit is installed into is arbitrary, so a name marker silently matches nothing and every
// re-run appends a duplicate instead of replacing.
function isOurs(group) {
  return (group.hooks || []).some((h) => {
    if (typeof h.command !== 'string') return false
    const cmd = h.command.replace(/\\/g, '/')
    return HOOKS.some(([, script]) => cmd.includes('hooks/' + script))
  })
}

function main() {
  const args = process.argv.slice(2)
  const uninstall = args.includes('--uninstall')
  const target =
    args.find((a) => !a.startsWith('--')) || path.join(os.homedir(), '.claude', 'settings.json')

  let settings = {}
  if (fs.existsSync(target)) {
    const raw = fs.readFileSync(target, 'utf8')
    const text = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()
    try {
      settings = text ? JSON.parse(text) : {}
    } catch (err) {
      // Never rewrite a file we could not read: that would destroy the user's settings.
      console.error('Could not parse ' + target + ' (' + err.message + ').')
      console.error('Fix the JSON by hand, then re-run. Nothing was changed.')
      process.exit(1)
    }
  }
  settings.hooks = settings.hooks || {}

  for (const [event, script, matcher] of HOOKS) {
    const kept = (settings.hooks[event] || []).filter((group) => !isOurs(group))

    if (uninstall) {
      if (kept.length) settings.hooks[event] = kept
      else delete settings.hooks[event]
      continue
    }

    const abs = path.join(__dirname, script).replace(/\\/g, '/')
    const group = { hooks: [{ type: 'command', command: 'node "' + abs + '"', timeout: 10 }] }
    if (matcher) group.matcher = matcher
    settings.hooks[event] = kept.concat([group])
  }

  if (fs.existsSync(target)) fs.copyFileSync(target, target + '.bak')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(settings, null, 2) + '\n')

  console.log((uninstall ? 'Removed' : 'Installed') + ' godkit hooks in ' + target)
  if (!uninstall) for (const [event, script] of HOOKS) console.log('  ' + event.padEnd(12) + script)
  if (fs.existsSync(target + '.bak')) console.log('Backup: ' + target + '.bak')
}

main()
