#!/usr/bin/env node
'use strict'
// Removes what the host's own uninstall cannot see: skills linked into per-tool directories and
// hook registrations in settings files.
//
// Run this BEFORE removing the package — this script ships inside it, so removing the package
// first deletes the script.
//
//   node scripts/uninstall.js            remove skills and hook registrations
//   node scripts/uninstall.js --dry-run  say what would go, change nothing

const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry-run')

const SKILL_DIRS = [
  ['claude', ['.claude', 'skills'], 'per-skill'],
  ['codex', ['.agents', 'skills'], 'per-skill'],
  ['antigravity', ['.gemini', 'antigravity', 'skills'], 'folder'],
]

const SETTINGS = [
  path.join(os.homedir(), '.claude', 'settings.json'),
  path.join(os.homedir(), '.codex', 'settings.json'),
]

// Kept in step with hooks/install.js. These filenames are what identifies our registrations.
const HOOK_SCRIPTS = [
  'brief.js',
  'clockout.js',
  'map-watch.js',
  'lazy-activate.js',
  'lazy-subagent.js',
  'lazy-mode-tracker.js',
]

function skillNames() {
  try {
    return fs
      .readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
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
    const victims = style === 'folder' ? [path.join(base, 'godkit')] : names.map((n) => path.join(base, n))
    let n = 0
    for (const v of victims) {
      if (!fs.existsSync(v)) continue
      n++
      if (!DRY) fs.rmSync(v, { recursive: true, force: true })
    }
    if (n) console.log((DRY ? 'would remove ' : 'removed ') + n + ' skill entries from ' + base + ' (' + tool + ')')
  }
}

function removeHooks() {
  for (const file of SETTINGS) {
    if (!fs.existsSync(file)) continue

    let settings
    const raw = fs.readFileSync(file, 'utf8')
    const text = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()
    try {
      settings = text ? JSON.parse(text) : {}
    } catch {
      // Leave a file we cannot read exactly as it is; a rewrite would destroy the user's config.
      console.warn('skipped ' + file + ': not valid JSON, left untouched')
      continue
    }
    if (!settings.hooks) continue

    // Only our own entries go. Another tool's hooks in the same file are none of our business.
    // Match the hook script paths, not the package name: the directory godkit is installed into
    // is arbitrary, so a name marker would match nothing and remove nothing.
    const ours = (h) => {
      if (typeof h.command !== 'string') return false
      const cmd = h.command.replace(/\\/g, '/')
      return HOOK_SCRIPTS.some((script) => cmd.includes('hooks/' + script))
    }

    let removed = 0
    for (const [event, groups] of Object.entries(settings.hooks)) {
      const kept = (groups || []).filter((group) => !(group.hooks || []).some(ours))
      removed += (groups || []).length - kept.length
      if (kept.length) settings.hooks[event] = kept
      else delete settings.hooks[event]
    }
    if (!removed) continue

    if (!DRY) {
      fs.copyFileSync(file, file + '.bak')
      fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n')
    }
    console.log((DRY ? 'would remove ' : 'removed ') + removed + ' hook entries from ' + file)
  }
}

// The mode flag is pure runtime state, not a user preference — safe to remove outright. The
// config file that holds the persisted default mode is left alone, same as every other tool's
// config survives its own uninstall.
function removeLazyState() {
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const flag = path.join(dir, '.godkit-lazy-active')
  if (!fs.existsSync(flag)) return
  if (!DRY) fs.rmSync(flag, { force: true })
  console.log((DRY ? 'would remove ' : 'removed ') + 'the godkit-lazy mode flag')
}

removeSkills()
removeHooks()
removeLazyState()
console.log('')
console.log("Left in place: every project's .agent/ directory and rule files. Those are your")
console.log('projects\' memory, not the package\'s — delete them by hand if you want them gone.')
