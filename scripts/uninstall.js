#!/usr/bin/env node
'use strict'
// Removes what the host's own uninstall cannot see: skills installed into per-tool directories,
// hook registrations in settings files, and this session-state directory.
//
// Run this BEFORE removing the package — this script ships inside it, so removing the package
// first deletes the script.
//
//   node scripts/uninstall.js            remove skills, hook registrations and runtime state
//   node scripts/uninstall.js --dry-run  say what would go, change nothing
//
// Nothing here deletes a path godkit did not create: what counts as ours is decided once, in
// lib/install.js, by the same rules the installer writes by.

const fs = require('fs')
const os = require('os')
const path = require('path')

const { applyHooks, readSettings, removeOne, settingsTargets, writeSettings } = require('../lib/install')
const { runtimeStateRoot } = require('../lib/session')

const ROOT = path.resolve(__dirname, '..')
const SKILLS = path.join(ROOT, 'skills')
const DRY = process.argv.includes('--dry-run')

const SKILL_DIRS = [
  ['claude', ['.claude', 'skills'], 'per-skill'],
  ['codex', ['.agents', 'skills'], 'per-skill'],
  ['antigravity', ['.gemini', 'antigravity', 'skills'], 'folder'],
]

function skillNames() {
  try {
    return fs
      .readdirSync(SKILLS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
}

function removeSkills() {
  const names = skillNames()
  for (const [tool, dir, style] of SKILL_DIRS) {
    const base = path.join(os.homedir(), ...dir)
    const victims =
      style === 'folder'
        ? [[path.join(base, 'godkit'), SKILLS]]
        : names.map((n) => [path.join(base, n), path.join(SKILLS, n)])

    let removed = 0
    const kept = []
    for (const [dest, src] of victims) {
      const result = removeOne(dest, src, DRY)
      if (result.how === 'absent') continue
      if (result.ok) removed++
      else kept.push(path.basename(dest))
    }
    if (removed) console.log((DRY ? 'would remove ' : 'removed ') + removed + ' skill entries from ' + base + ' (' + tool + ')')
    if (kept.length) console.log('  kept (not ours): ' + kept.join(', '))
  }
}

function removeHooks() {
  for (const [, file] of settingsTargets()) {
    if (!fs.existsSync(file)) continue

    let record
    try {
      record = readSettings(file)
    } catch {
      // Leave a file we cannot read exactly as it is; a rewrite would destroy the user's config.
      console.warn('skipped ' + file + ': not valid JSON, left untouched')
      continue
    }

    const result = applyHooks(record.settings, { uninstall: true })
    if (!result.removed) continue
    writeSettings(file, result.settings, record, DRY)
    console.log((DRY ? 'would remove ' : 'removed ') + result.removed + ' hook entries from ' + file)
  }
}

// Per-session runtime state is ours outright — it is a scratch directory keyed by host session,
// not user configuration. The config file holding the persisted lazy default mode is left alone,
// the same way every other tool's config survives its own uninstall.
function removeRuntimeState() {
  const dir = runtimeStateRoot()
  if (!fs.existsSync(dir)) return
  if (!DRY) fs.rmSync(dir, { recursive: true, force: true })
  console.log((DRY ? 'would remove ' : 'removed ') + 'the godkit session-state directory ' + dir)
}

removeSkills()
removeHooks()
removeRuntimeState()
console.log('')
console.log("Left in place: every project's .agent/ directory and rule files. Those are your")
console.log('projects\' memory, not the package\'s — delete them by hand if you want them gone.')
