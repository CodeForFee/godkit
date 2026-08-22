'use strict'
// One place that knows what godkit installs and what it is allowed to remove. Install and
// uninstall drifting apart is how a tool deletes something a user wrote, so both sides — the hook
// registrations and the skill directories — are decided here and nowhere else.

const fs = require('fs')
const os = require('os')
const path = require('path')

const { isInside, samePath } = require('./paths')
const { atomicWriteFile, readRaw } = require('./session')

const ROOT = path.resolve(__dirname, '..')
const MARKER = '.godkit-install.json'
const MARKER_OWNER = 'godkit-package-install'
const MARKER_VERSION = 1

// event, script, matcher, argv, timeout. The single source of truth: hooks/install.js writes it,
// scripts/uninstall.js removes it, and tests assert godkit-hooks.json agrees with it.
const HOOKS = [
  ['SessionStart', 'brief.js', 'startup|resume|clear|compact', [], 10],
  ['SessionStart', 'lazy-activate.js', 'startup|resume|clear|compact', [], 5],
  ['UserPromptSubmit', 'lazy-mode-tracker.js', null, [], 5],
  ['SubagentStart', 'lazy-subagent.js', null, [], 5],
  ['PreToolUse', 'work-track.js', 'Bash', ['pre'], 10],
  ['PostToolUse', 'work-track.js', 'Bash', ['post'], 10],
  ['PostToolUse', 'work-track.js', 'Edit|Write|MultiEdit|NotebookEdit', ['edit'], 10],
  ['PostToolUse', 'map-watch.js', 'Bash', [], 10],
  ['Stop', 'clockout.js', null, [], 10],
  ['SessionEnd', 'work-track.js', null, ['end'], 5],
]

const HOOK_SCRIPTS = [...new Set(HOOKS.map(([, script]) => script))]

function hookCommand(hooksDir, script, argv) {
  const abs = path.join(hooksDir, script).replace(/\\/g, '/')
  return ['node "' + abs + '"', ...(argv || [])].join(' ')
}

// Ours by the hook SCRIPT path, never by the package name: the directory godkit is installed into
// is arbitrary, so a name marker matches nothing and every re-run appends a duplicate.
function isOurHandler(handler) {
  if (!handler || typeof handler.command !== 'string') return false
  const cmd = handler.command.replace(/\\/g, '/')
  return HOOK_SCRIPTS.some((script) => cmd.includes('hooks/' + script))
}

// Filters HANDLERS, not groups. A user is free to put their own hook in the same group as ours;
// dropping the whole group to remove ours would take their hook with it.
function stripOurHooks(groups) {
  const kept = []
  let removed = 0
  for (const group of Array.isArray(groups) ? groups : []) {
    if (!group || typeof group !== 'object') {
      kept.push(group)
      continue
    }
    const handlers = Array.isArray(group.hooks) ? group.hooks : []
    const survivors = handlers.filter((handler) => !isOurHandler(handler))
    removed += handlers.length - survivors.length
    if (!handlers.length) kept.push(group) // not a handler group; none of our business
    else if (survivors.length) kept.push(Object.assign({}, group, { hooks: survivors }))
  }
  return { kept, removed }
}

// Returns a NEW settings object; the caller's copy is never mutated in place, so a failed write
// cannot leave a half-edited object behind.
function applyHooks(settings, options) {
  const o = options || {}
  const base = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {}
  const next = Object.assign({}, base)
  const events = base.hooks && typeof base.hooks === 'object' && !Array.isArray(base.hooks) ? base.hooks : {}
  const hooks = Object.assign({}, events)

  let removed = 0
  let added = 0
  const touched = new Set(HOOKS.map(([event]) => event))
  for (const event of Object.keys(hooks)) touched.add(event)

  for (const event of touched) {
    const result = stripOurHooks(hooks[event])
    removed += result.removed
    if (result.kept.length) hooks[event] = result.kept
    else delete hooks[event]
  }

  if (!o.uninstall) {
    const hooksDir = o.hooksDir || path.join(ROOT, 'hooks')
    for (const [event, script, matcher, argv, timeout] of HOOKS) {
      const group = {
        hooks: [{ type: 'command', command: hookCommand(hooksDir, script, argv), timeout }],
      }
      if (matcher) group.matcher = matcher
      hooks[event] = (hooks[event] || []).concat([group])
      added++
    }
  }

  if (Object.keys(hooks).length) next.hooks = hooks
  else delete next.hooks
  return { settings: next, removed, added }
}

function readSettings(file) {
  const raw = readRaw(file)
  if (raw === null) return { raw: null, settings: {} }
  const text = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()
  if (!text) return { raw, settings: {} }
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    // Never rewrite a file we could not read: a rewrite would destroy the user's settings.
    throw new Error('could not parse ' + file + ' (' + error.message + '); nothing was changed')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(file + ' does not contain a JSON object; nothing was changed')
  }
  return { raw, settings: value }
}

// Compare-and-swap against the bytes we read, so a concurrent editor loses nothing silently.
function writeSettings(file, settings, record, dryRun) {
  if (dryRun) return false
  atomicWriteFile(file, JSON.stringify(settings, null, 2) + '\n', {
    expectedRaw: record ? record.raw : null,
    backup: true,
  })
  return true
}

function settingsTargets(env) {
  const e = env || process.env
  const home = os.homedir()
  return [
    ['claude', path.join(e.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'settings.json')],
    ['codex', path.join(e.CODEX_HOME || path.join(home, '.codex'), 'settings.json')],
  ]
}

// --- skill directories ----------------------------------------------------------------------

function markerBody(source) {
  return JSON.stringify(
    { owner: MARKER_OWNER, version: MARKER_VERSION, source: source.replace(/\\/g, '/') },
    null,
    2,
  ) + '\n'
}

function readInstallMarker(dest) {
  try {
    const file = path.join(dest, MARKER)
    if (!fs.lstatSync(file).isFile()) return null
    const marker = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!marker || marker.owner !== MARKER_OWNER || marker.version !== MARKER_VERSION) return null
    return marker
  } catch {
    return null
  }
}

// May godkit replace or delete `dest`? Only if it is absent, a link pointing back into this
// package, or a copy carrying our marker. Everything else belongs to the user or another tool.
function ownership(dest, src) {
  let stat
  try {
    stat = fs.lstatSync(dest)
  } catch {
    return 'absent'
  }
  // Node reports a Windows junction as a symbolic link too, so this covers both link styles.
  if (stat.isSymbolicLink()) {
    let target
    try {
      target = fs.realpathSync(dest)
    } catch {
      return 'ours-broken-link' // a link into a package that is gone is still our leftover
    }
    if (samePath(target, src) || isInside(ROOT, target)) return 'ours-link'
    return 'foreign'
  }
  if (!stat.isDirectory()) return 'foreign'
  return readInstallMarker(dest) ? 'ours-copy' : 'foreign'
}

const OWNED = new Set(['ours-link', 'ours-copy', 'ours-broken-link'])

// Symlinks need elevation on Windows, junctions do not. A copy is the last resort so a non-admin
// install still works — it just will not track later edits to the package.
function installOne(src, dest, dryRun) {
  const own = ownership(dest, src)
  if (own === 'foreign') {
    return { ok: false, how: 'refused', reason: 'exists and is not ours — rename or remove it first' }
  }
  if (dryRun) return { ok: true, how: own === 'absent' ? 'would install' : 'would replace' }

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (own !== 'absent') fs.rmSync(dest, { recursive: true, force: true })
  try {
    fs.symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir')
    return { ok: true, how: 'linked' }
  } catch {
    /* fall through to a marked copy */
  }
  try {
    fs.cpSync(src, dest, { recursive: true })
    fs.writeFileSync(path.join(dest, MARKER), markerBody(src))
    return { ok: true, how: 'copied' }
  } catch (error) {
    return { ok: false, how: 'failed', reason: error.message }
  }
}

function removeOne(dest, src, dryRun) {
  const own = ownership(dest, src)
  if (own === 'absent') return { ok: true, how: 'absent' }
  if (!OWNED.has(own)) return { ok: false, how: 'kept', reason: 'not ours' }
  if (!dryRun) fs.rmSync(dest, { recursive: true, force: true })
  return { ok: true, how: dryRun ? 'would remove' : 'removed' }
}

module.exports = {
  ROOT,
  MARKER,
  MARKER_OWNER,
  HOOKS,
  HOOK_SCRIPTS,
  hookCommand,
  isOurHandler,
  stripOurHooks,
  applyHooks,
  readSettings,
  writeSettings,
  settingsTargets,
  ownership,
  installOne,
  removeOne,
}
