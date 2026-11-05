'use strict'
// One place that knows what godkit installs and what it is allowed to remove. Install and
// uninstall drifting apart is how a tool deletes something a user wrote, so both sides — the hook
// registrations and the skill directories — are decided here and nowhere else.

const fs = require('fs')
const os = require('os')
const path = require('path')

const { isInside, real, samePath } = require('./paths')
const { SHELL_TRIGGER } = require('./guard')
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
  ['PreToolUse', 'guard.js', 'Bash|Edit|Write|MultiEdit|NotebookEdit|apply_patch', [], 10],
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
  const hooksDirFor = o.hooksDir || path.join(ROOT, 'hooks')
  if (o.kind === 'cursor') return applyCursor(settings, { uninstall: o.uninstall, hooksDir: hooksDirFor })
  if (o.kind === 'antigravity') return applyAntigravity(settings, { uninstall: o.uninstall, hooksDir: hooksDirFor })
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
  const body = JSON.stringify(settings, null, 2) + '\n'
  // A settings file that already says exactly this is not rewritten. Re-registering
  // identical hooks used to rename a temp file over the user's live config every single
  // time, which on Windows is an EPERM waiting for any second process to hit the same
  // instant — and it churned the .bak for nothing. No change means no write.
  if (record && record.raw === body) return false
  atomicWriteFile(file, body, {
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
    // Codex reads hooks from hooks.json, same {hooks: {...}} shape as Claude; never settings.json.
    ['codex', path.join(e.CODEX_HOME || path.join(home, '.codex'), 'hooks.json')],
  ]
}

// --- hosts with their own hook dialect ---------------------------------------------------------

// Cursor and Antigravity do not read the Claude-shaped file, so each gets one handler per host event,
// every one pointing at hooks/adapt.js, which picks the HOOKS rows for that event and translates.
// Host event -> the HOOKS event it stands for (+ options for the host's own entry).
//
// Antigravity documents PreToolUse's `allow` as "delegating to the next hook or default policy", so
// a neutral answer is safe there and it gets the whole PreToolUse set. Cursor documents no neutral
// answer (empty output is ambiguous, and what `allow` does to its approval prompt is not stated), so
// it only gets beforeShellExecution, filtered by command text to what the guard can deny; a command
// that matches but passes is answered `ask`, which can only add a prompt, never remove one.
const ADAPTED = {
  cursor: [
    ['sessionStart', 'SessionStart'],
    ['postToolUse', 'PostToolUse'],
    ['beforeShellExecution', 'PreToolUse', { matcher: SHELL_TRIGGER }],
    ['stop', 'Stop'],
    ['sessionEnd', 'SessionEnd'],
  ],
  antigravity: [
    ['SessionStart', 'SessionStart'],
    ['PreToolUse', 'PreToolUse'],
    ['PostToolUse', 'PostToolUse'],
    ['Stop', 'Stop'],
  ],
}
const ADAPT_LOOP_LIMIT = 3 // Cursor re-submits a stop hook's followup this many times, then lets go
const TOOL_EVENT = new Set(['PreToolUse', 'PostToolUse'])

// work-track's pre/post pair needs a PreToolUse on every tool call, which Cursor cannot safely give.
function adaptedRows(event, host) {
  return HOOKS.filter(
    ([e, script, , argv]) =>
      e === event && !(host === 'cursor' && script === 'work-track.js' && (argv[0] === 'pre' || argv[0] === 'post')),
  )
}

function adaptCommand(hooksDir, host, hostEvent) {
  return 'node "' + path.join(hooksDir, 'adapt.js').replace(/\\/g, '/') + '" ' + host + ' ' + hostEvent
}

function isAdaptHandler(handler) {
  return Boolean(handler) && typeof handler.command === 'string' && handler.command.replace(/\\/g, '/').includes('hooks/adapt.js')
}

function adaptTimeout(host, event) {
  return adaptedRows(event, host).reduce((n, row) => n + row[4], 0)
}

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

// Same contract as applyHooks: a NEW object, ours replaced, anything else in the file kept.
function applyCursor(config, o) {
  const base = isObject(config) ? config : {}
  const hooks = Object.assign({}, isObject(base.hooks) ? base.hooks : {})
  let removed = 0
  let added = 0
  for (const event of Object.keys(hooks)) {
    const list = Array.isArray(hooks[event]) ? hooks[event] : []
    const kept = list.filter((h) => !isAdaptHandler(h))
    if (kept.length === list.length) continue
    removed += list.length - kept.length
    if (kept.length) hooks[event] = kept
    else delete hooks[event]
  }
  if (!o.uninstall) {
    for (const [hostEvent, event, extra] of ADAPTED.cursor) {
      const entry = Object.assign({ command: adaptCommand(o.hooksDir, 'cursor', hostEvent), timeout: adaptTimeout('cursor', event) }, extra)
      if (hostEvent === 'stop') entry.loop_limit = ADAPT_LOOP_LIMIT
      hooks[hostEvent] = (hooks[hostEvent] || []).concat([entry])
      added++
    }
  }
  const next = Object.assign({}, base)
  if (!o.uninstall && next.version === undefined) next.version = 1
  if (Object.keys(hooks).length) next.hooks = hooks
  else delete next.hooks
  return { settings: next, removed, added }
}

// Antigravity keys hooks by NAME, so everything of ours lives under one key and nothing else is touched.
function applyAntigravity(config, o) {
  const base = isObject(config) ? config : {}
  const next = Object.assign({}, base)
  const prior = base.godkit
  if (prior !== undefined && !ourHandlers(base, 'antigravity').length) {
    return { settings: base, removed: 0, added: 0, skipped: 'a hook named "godkit" already exists and is not ours' }
  }
  const removed = prior === undefined ? 0 : ourHandlers(base, 'antigravity').length
  delete next.godkit
  let added = 0
  if (!o.uninstall) {
    const entry = { enabled: true }
    for (const [hostEvent, event] of ADAPTED.antigravity) {
      const handler = { type: 'command', command: adaptCommand(o.hooksDir, 'antigravity', hostEvent), timeout: adaptTimeout('antigravity', event) }
      entry[hostEvent] = TOOL_EVENT.has(hostEvent) ? [{ matcher: '*', hooks: [handler] }] : [handler]
      added++
    }
    next.godkit = entry
  }
  return { settings: next, removed, added }
}

// Our handler objects in a hook file of the given kind, whatever its shape.
function ourHandlers(settings, kind) {
  const out = []
  const s = isObject(settings) ? settings : {}
  if (kind === 'antigravity') {
    for (const list of Object.values(isObject(s.godkit) ? s.godkit : {})) {
      for (const item of Array.isArray(list) ? list : []) {
        for (const h of (item && item.hooks) || [item]) if (isAdaptHandler(h)) out.push(h)
      }
    }
  } else if (kind === 'cursor') {
    for (const list of Object.values(isObject(s.hooks) ? s.hooks : {})) {
      for (const h of Array.isArray(list) ? list : []) if (isAdaptHandler(h)) out.push(h)
    }
  } else {
    for (const groups of Object.values(isObject(s.hooks) ? s.hooks : {})) {
      for (const group of Array.isArray(groups) ? groups : []) {
        for (const h of (group && group.hooks) || []) if (isOurHandler(h)) out.push(h)
      }
    }
  }
  return out
}

function expectedCount(kind) {
  return ADAPTED[kind] ? ADAPTED[kind].length : HOOKS.length
}

// Every hook file godkit manages: [tool, file, kind]. Cursor and Antigravity only when installed (or
// pointed at explicitly) — an installer must not create ~/.cursor for someone who has no Cursor.
function allTargets(env) {
  const e = env || process.env
  const home = os.homedir()
  const out = settingsTargets(e).map(([tool, file]) => [tool, file, tool])
  const cursor = e.CURSOR_HOME || path.join(home, '.cursor')
  if (e.CURSOR_HOME || fs.existsSync(cursor)) out.push(['cursor', path.join(cursor, 'hooks.json'), 'cursor'])
  const gemini = e.GEMINI_HOME || path.join(home, '.gemini')
  if (e.GEMINI_HOME || fs.existsSync(path.join(gemini, 'antigravity'))) {
    out.push(['antigravity', path.join(gemini, 'config', 'hooks.json'), 'antigravity'])
  }
  return out
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
    // real(), not fs.realpathSync: the two disagree on 8.3 short names and `src` is canonical.
    const target = real(dest)
    if (!target) return 'ours-broken-link' // a link into a package that is gone is still our leftover
    if (samePath(target, src) || isInside(ROOT, target)) return 'ours-link'
    return 'foreign'
  }
  if (!stat.isDirectory()) return 'foreign'
  return readInstallMarker(dest) ? 'ours-copy' : 'foreign'
}

// --- a home that outlives npx ----------------------------------------------------------------

// `npx` runs the package out of ~/.npm/_npx/<hash>, which npm prunes whenever it likes. Hooks and
// skill links pointing there work on day one and vanish later with nothing on screen to say so.
// Anything that writes a path meant to persist runs from a copy under ~/.godkit/<version> instead.
function isEphemeral(root) {
  return /[\\/]_npx[\\/]/.test(root) || process.env.GODKIT_FORCE_STABLE === '1'
}

function stableHome() {
  return process.env.GODKIT_HOME || path.join(os.homedir(), '.godkit')
}

// Returns the root to run from: ROOT itself when it is already permanent, else the stable copy,
// made once per version via a temp-and-rename so an interrupted copy is never mistaken for whole.
function stableRoot(version, root) {
  const from = root || ROOT
  if (!isEphemeral(from)) return from
  const dest = path.join(stableHome(), String(version))
  if (fs.existsSync(path.join(dest, 'package.json'))) return dest
  const tmp = dest + '.tmp-' + process.pid
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  // Exactly what the package ships: its `files` allowlist plus the manifest. Never a checkout's
  // .git, worktrees or node_modules.
  const pkg = JSON.parse(fs.readFileSync(path.join(from, 'package.json'), 'utf8'))
  for (const entry of ['package.json'].concat(pkg.files || [])) {
    const src = path.join(from, entry)
    if (fs.existsSync(src)) fs.cpSync(src, path.join(tmp, entry), { recursive: true })
  }
  try {
    fs.renameSync(tmp, dest)
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true })
    if (!fs.existsSync(path.join(dest, 'package.json'))) throw error // lost a race to a twin: fine
  }
  return dest
}

const OWNED = new Set(['ours-link', 'ours-copy', 'ours-broken-link'])

// Symlinks need elevation on Windows, junctions do not. A copy is the last resort so a non-admin
// install still works — it just will not track later edits to the package. `copy` skips the link
// outright: a project copy is committed, and a link into one machine's package means nothing to
// the next clone. `label` replaces the absolute source in the marker so it does not churn per machine.
function installOne(src, dest, dryRun, opts) {
  const o = opts || {}
  const own = ownership(dest, src)
  if (own === 'foreign') {
    return { ok: false, how: 'refused', reason: 'exists and is not ours — rename or remove it first' }
  }
  if (dryRun) return { ok: true, how: own === 'absent' ? 'would install' : 'would replace' }

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (own !== 'absent') fs.rmSync(dest, { recursive: true, force: true })
  if (!o.copy) {
    try {
      fs.symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir')
      return { ok: true, how: 'linked' }
    } catch {
      /* fall through to a marked copy */
    }
  }
  try {
    fs.cpSync(src, dest, { recursive: true })
    fs.writeFileSync(path.join(dest, MARKER), markerBody(o.label || src))
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
  allTargets,
  ADAPTED,
  adaptedRows,
  ourHandlers,
  expectedCount,
  ownership,
  isEphemeral,
  stableHome,
  stableRoot,
  installOne,
  removeOne,
}
