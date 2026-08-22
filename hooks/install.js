#!/usr/bin/env node
'use strict'
// Registers the godkit hooks in a Claude Code or Codex settings file, with paths derived from
// where this file actually lives — nothing to hand-edit, and moving the package is a re-run
// rather than a text hunt.
//
//   node install.js                → ~/.claude/settings.json (or $CLAUDE_CONFIG_DIR)
//   node install.js <path>         → that settings file instead
//   node install.js --uninstall
//   node install.js --dry-run      → say what would change, write nothing
//
// Re-running is safe: our own registrations are dropped and re-added, so a stale path from an
// earlier location cannot survive. Other tools' hooks in the same file — including one sharing a
// group with ours — are left untouched.

const { HOOKS, applyHooks, readSettings, settingsTargets, writeSettings } = require('../lib/install')

function main() {
  const args = process.argv.slice(2)
  const uninstall = args.includes('--uninstall')
  const dryRun = args.includes('--dry-run')
  const target = args.find((a) => !a.startsWith('--')) || settingsTargets()[0][1]

  let record
  try {
    record = readSettings(target)
  } catch (error) {
    console.error(error.message)
    console.error('Fix the JSON by hand, then re-run.')
    process.exit(1)
  }

  const result = applyHooks(record.settings, { uninstall, hooksDir: __dirname })
  const wrote = writeSettings(target, result.settings, record, dryRun)

  const verb = uninstall ? 'Removed' : 'Installed'
  console.log((dryRun ? 'Would have ' + verb.toLowerCase() : verb) + ' godkit hooks in ' + target)
  console.log('  ' + result.removed + ' existing godkit handlers replaced')
  if (!uninstall) for (const [event, script, , argv] of HOOKS) {
    console.log('  ' + event.padEnd(17) + [script, ...argv].join(' '))
  }
  if (wrote && record.raw !== null) console.log('Backup: ' + target + '.bak')
}

main()
