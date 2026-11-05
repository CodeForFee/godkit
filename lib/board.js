'use strict'
// The claims table in .agent/BOARD.md as code: who holds which files. Agents used to edit this table
// by hand, which is how two of them ended up holding the same file. Everything that reads or writes
// a claim (the MCP tools, the guard hook, the pre-commit check) goes through here.
//
// godkit: overlap is decided on the literal prefix of each glob, so `src/*` and `src/auth/x.ts`
// overlap and `*.ts` overlaps everything. Conservative on purpose: a false conflict costs one
// retry, a missed one costs a merge. Real glob intersection if conflicts get noisy.

const { paths } = require('./paths')
const { atomicWriteFile, readRaw } = require('./session')

const PLACEHOLDER = '| — | nothing claimed | — | — | the whole repo is free |'
const STALE_HOURS = 24
const CLOSED = new Set(['released', 'done', 'stale', 'abandoned'])

const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.\//, '')

// --- parsing ---------------------------------------------------------------------------------

function section(lines) {
  const head = lines.findIndex((l) => /^##\s+Now\s*\(claims\)/i.test(l))
  if (head < 0) return null
  let first = -1
  for (let i = head + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break
    if (lines[i].startsWith('|')) {
      first = i
      break
    }
  }
  if (first < 0) return { head, first: -1, end: -1 }
  let end = first
  while (end < lines.length && lines[end].startsWith('|')) end++
  return { head, first, end }
}

function cells(line) {
  return line.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
}

function parseSince(text) {
  const m = /(\d{4})-(\d\d)-(\d\d)T(\d\d):?(\d\d)/.exec(String(text || ''))
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null
}

// The tag a claim carries so its holder can recognise it: "claude-opus-5 (9fe96f63)".
function tagOf(agent) {
  const m = /\(([A-Za-z0-9-]{4,16})\)\s*$/.exec(String(agent || ''))
  return m ? m[1].toLowerCase() : null
}

const baseOf = (agent) => String(agent || '').replace(/\s*\([A-Za-z0-9-]{4,16}\)\s*$/, '').trim()

function readClaims(text) {
  const lines = String(text || '').split(/\r?\n/)
  const s = section(lines)
  if (!s || s.first < 0) return []
  const rows = []
  for (let i = s.first + 2; i < s.end; i++) {
    const [agent, scope, task, since, status] = cells(lines[i])
    if (!agent || agent === '—' || /^-+$/.test(agent)) continue
    rows.push({ agent, scope: scope || '', task: task || '', since: since || '', status: (status || '').toLowerCase(), line: i })
  }
  return rows
}

// A claim blocks others only while it is live: not closed, and under a day old.
function isOpen(row, now) {
  if (CLOSED.has(row.status)) return false
  const at = parseSince(row.since)
  return at === null || (now || Date.now()) - at < STALE_HOURS * 3600 * 1000
}

// --- globs -----------------------------------------------------------------------------------

const globs = (scope) => String(scope || '').split(/[\s,]+/).map(norm).filter(Boolean)
const hasWild = (g) => /[*?[{]/.test(g)

function toRegExp(glob) {
  let src = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') {
          i++
          src += '(?:.*/)?'
        } else src += '.*'
      } else src += '[^/]*'
    } else if (c === '?') src += '[^/]'
    else src += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp('^' + src + '$')
}

// A claim "src/auth" or "lib/" covers everything under it; a plain file covers itself.
function covers(scope, file) {
  const f = norm(file)
  return globs(scope).some((g) => {
    if (hasWild(g)) return toRegExp(g).test(f)
    const dir = g.replace(/\/$/, '')
    return f === dir || f.startsWith(dir + '/')
  })
}

function prefixOf(g) {
  const i = g.search(/[*?[{]/)
  return i < 0 ? g.replace(/\/$/, '') : g.slice(0, i)
}

function nested(a, b) {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short === '') return true
  return long.startsWith(short.endsWith('/') ? short : short + '/') || (hasWild(short) && long.startsWith(short))
}

function scopesOverlap(a, b) {
  for (const ga of globs(a)) {
    for (const gb of globs(b)) {
      if (nested(prefixOf(ga), prefixOf(gb))) return true
      if (!hasWild(gb) && covers(ga, gb)) return true
      if (!hasWild(ga) && covers(gb, ga)) return true
    }
  }
  return false
}

// --- changes ---------------------------------------------------------------------------------

function stamp(now) {
  return new Date(now || Date.now()).toISOString().slice(0, 16) + 'Z'
}

const SAFE_CELL = /^[^|\r\n]{1,300}$/

function check(name, value, re) {
  if (typeof value !== 'string' || !(re || SAFE_CELL).test(value)) throw new Error(name + ' is missing or has a pipe or newline in it')
  return value.trim()
}

function writeRows(text, mutate) {
  const lines = String(text || '').split(/\r?\n/)
  let s = section(lines)
  if (!s) throw new Error('BOARD.md has no "## Now (claims)" section')
  if (s.first < 0) {
    lines.splice(s.head + 1, 0, '', '| agent | scope (file globs) | task | since (UTC) | status |', '|---|---|---|---|---|', PLACEHOLDER)
    s = section(lines)
  }
  const rows = lines.slice(s.first + 2, s.end).filter((l) => cells(l)[0] !== '—')
  const next = mutate(rows)
  const body = next.length ? next : [PLACEHOLDER]
  lines.splice(s.first + 2, s.end - (s.first + 2), ...body)
  return lines.join('\n')
}

// Returns { text, claim } or { text, conflict } when a live claim by someone else overlaps.
function addClaim(text, o) {
  const agent = check('agent', o.agent, /^[A-Za-z0-9._-]{1,64}$/)
  const scope = check('scope', o.scope)
  const task = check('task', o.task)
  const tag = o.session ? String(o.session).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 8) : ''
  if (o.session && tag.length < 4) throw new Error('session must be at least 4 letters or digits')
  const cell = tag ? agent + ' (' + tag + ')' : agent
  const now = o.now || Date.now()
  const conflict = readClaims(text).find(
    (r) => isOpen(r, now) && baseOf(r.agent) !== agent && scopesOverlap(r.scope, scope),
  )
  if (conflict) return { text, conflict }
  const row = '| ' + [cell, scope, task, stamp(now), 'wip'].join(' | ') + ' |'
  const out = writeRows(text, (rows) => rows.filter((l) => cells(l)[0] !== cell).concat([row]))
  return { text: out, claim: row }
}

function releaseClaim(text, o) {
  const agent = check('agent', o.agent, /^[A-Za-z0-9._-]{1,64}$/)
  let removed = 0
  const out = writeRows(text, (rows) =>
    rows.filter((l) => {
      const c = cells(l)
      const mine = baseOf(c[0]) === agent && (!o.scope || norm(c[1]) === norm(o.scope))
      if (mine) removed++
      return !mine
    }),
  )
  return { text: out, removed }
}

// Compare-and-swap against the bytes read, so two agents claiming at once cannot both win.
function updateBoard(root, change) {
  const file = paths(root).board
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = readRaw(file)
    if (raw === null) throw new Error('no .agent/BOARD.md here — run `godkit init`')
    const result = change(raw)
    if (result.text === raw) return result
    try {
      atomicWriteFile(file, result.text, { expectedRaw: raw })
      return result
    } catch (error) {
      if (!/changed while/.test(error.message) || attempt === 2) throw error
    }
  }
  return null
}

// Files outside every live claim, for the pre-commit check. `.agent/` is the protocol's own.
function unclaimed(text, files, now) {
  const live = readClaims(text).filter((r) => isOpen(r, now))
  return files.map(norm).filter((f) => f && !f.startsWith('.agent/') && !live.some((r) => covers(r.scope, f)))
}

module.exports = {
  PLACEHOLDER,
  STALE_HOURS,
  readClaims,
  isOpen,
  tagOf,
  baseOf,
  covers,
  scopesOverlap,
  addClaim,
  releaseClaim,
  updateBoard,
  unclaimed,
}
