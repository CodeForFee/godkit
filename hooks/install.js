#!/usr/bin/env node
// Registers agent-brief.js in Claude Code settings, with the path derived from where this file
// actually lives — nothing to hand-edit, and moving the harness is a re-run, not a text hunt.
//   node install.js            → ~/.claude/settings.json
//   node install.js <path>     → that settings file instead (e.g. a project .claude/settings.json)
//   node install.js --uninstall

const fs = require('fs')
const os = require('os')
const path = require('path')

const script = path.join(__dirname, 'agent-brief.js').replace(/\\/g, '/')
const args = process.argv.slice(2)
const uninstall = args.includes('--uninstall')
const target = args.find((a) => !a.startsWith('--')) || path.join(os.homedir(), '.claude', 'settings.json')

const command = (flag) => 'node "' + script + '" ' + flag
const isOurs = (group) =>
  (group.hooks || []).some((h) => typeof h.command === 'string' && h.command.includes('agent-brief.js'))

const settings = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {}
settings.hooks = settings.hooks || {}

for (const [event, flag] of [
  ['SessionStart', '--session-start'],
  ['Stop', '--stop'],
]) {
  // Drop any previous registration first, so re-running after a move never leaves a stale path.
  const kept = (settings.hooks[event] || []).filter((group) => !isOurs(group))
  if (uninstall) {
    if (kept.length) settings.hooks[event] = kept
    else delete settings.hooks[event]
    continue
  }
  settings.hooks[event] = kept.concat([{ hooks: [{ type: 'command', command: command(flag) }] }])
}

if (fs.existsSync(target)) fs.copyFileSync(target, target + '.bak')
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, JSON.stringify(settings, null, 2) + '\n')

console.log((uninstall ? 'Removed' : 'Installed') + ' agent-brief hooks in ' + target)
if (!uninstall) console.log('  ' + script)
console.log('Backup: ' + target + '.bak')
