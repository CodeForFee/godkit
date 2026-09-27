'use strict'
// Unbounded memory, constant context. Everything agents ever wrote stays on disk; what a session
// is handed at start stays the same size no matter how long the project has run. Two halves:
//
//   archive — moves what is finished (old fixed bugs, old handoffs, old thread blocks) out of the
//             files every session reads, into .agent/archive/. Moves, never deletes. Decisions and
//             open work are never moved: they still bind whoever arrives next.
//   recall  — searches all of it, archive included, and answers in a bounded number of bytes.

const fs = require('fs')
const path = require('path')

const { paths, fitBytes } = require('./paths')
const { atomicWriteFile } = require('./graph')

const KEEP_FIXED = 10
const KEEP_HANDOFFS = 3
const KEEP_THREAD_BLOCKS = 5
const THREAD_DAYS = 14
const RECALL_BYTES = 2048

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

// Section = heading line through the line before the next level-2 heading.
function sections(lines) {
  const out = []
  let cur = { head: null, start: 0, lines: [] }
  lines.forEach((line, i) => {
    if (/^## /.test(line)) {
      out.push(cur)
      cur = { head: line, start: i, lines: [line] }
    } else cur.lines.push(line)
  })
  out.push(cur)
  return out
}

// A bullet and its indented continuation lines travel together.
function bullets(body) {
  const items = []
  const rest = []
  for (const line of body) {
    if (/^\s*[-*] /.test(line) && !/^\s{2,}/.test(line)) items.push([line])
    else if (items.length && /^\s{2,}\S/.test(line)) items[items.length - 1].push(line)
    else rest.push({ line, after: items.length })
  }
  return { items, rest }
}

function month() {
  return new Date().toISOString().slice(0, 7)
}

function appendArchive(dir, name, moved) {
  if (!moved.length) return null
  const file = path.join(dir, 'archive', name + '-' + month() + '.md')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const prior = read(file) || '# Archive — ' + name + ' ' + month() + '\n\nMoved here by godkit, never deleted. `godkit recall` searches this.\n'
  atomicWriteFile(file, prior.replace(/\s*$/, '\n') + '\n## archived ' + new Date().toISOString() + '\n\n' + moved.join('\n') + '\n')
  return file
}

// Returns { board: n, thread: n } lines moved. Safe to run every clock-out: a board with nothing
// to move is not rewritten.
function archive(root, now) {
  const p = paths(root)
  const result = { board: 0, thread: 0 }
  const board = read(p.board)
  if (board !== null) {
    const nl = board.includes('\r\n') ? '\r\n' : '\n'
    const secs = sections(board.split(/\r?\n/))
    const moved = []
    for (const sec of secs) {
      if (!sec.head) continue
      const body = sec.lines.slice(1)
      const { items, rest } = bullets(body)
      let drop = null
      if (/^## Bugs/i.test(sec.head)) {
        const fixed = items.filter((it) => /^\s*[-*] \[x\]/i.test(it[0]))
        drop = new Set(fixed.slice(0, Math.max(0, fixed.length - KEEP_FIXED)))
      } else if (/handoff/i.test(sec.head)) {
        drop = new Set(items.slice(KEEP_HANDOFFS)) // newest first
      }
      if (!drop || !drop.size) continue
      const out = [sec.head]
      // Re-emit in the original order, minus the dropped items.
      let r = 0
      for (let i = 0; i <= items.length; i++) {
        while (r < rest.length && rest[r].after === i) out.push(rest[r++].line)
        if (i < items.length) {
          if (drop.has(items[i])) moved.push(...items[i])
          else out.push(...items[i])
        }
      }
      sec.lines = out
    }
    if (moved.length) {
      const where = appendArchive(p.dir, 'BOARD', moved)
      atomicWriteFile(p.board, secs.map((s) => s.lines.join(nl)).join(nl))
      result.board = moved.length
      result.boardArchive = where
    }
  }

  const thread = read(p.thread)
  if (thread !== null) {
    const cutoff = (now || Date.now()) - THREAD_DAYS * 86400000
    const parts = thread.split(/(?=^## \d{4}-\d{2}-\d{2}T)/m)
    const head = parts[0].startsWith('## ') ? '' : parts.shift()
    const old = []
    const keep = []
    parts.forEach((block, i) => {
      const stamp = Date.parse(block.slice(3, 13))
      const recent = i >= parts.length - KEEP_THREAD_BLOCKS
      if (!recent && !Number.isNaN(stamp) && stamp < cutoff) old.push(block.replace(/\s+$/, ''))
      else keep.push(block)
    })
    if (old.length) {
      appendArchive(p.dir, 'THREAD', old)
      atomicWriteFile(p.thread, head + keep.join(''))
      result.thread = old.length
    }
  }
  return result
}

// --- recall -----------------------------------------------------------------------------------

function list(dir, newestFirst) {
  try {
    const names = fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort()
    return (newestFirst ? names.reverse() : names).map((n) => path.join(dir, n))
  } catch {
    return []
  }
}

// Newest evidence first: logs, then the live board and thread, then tasks, then the archive.
function sources(root) {
  const p = paths(root)
  return [
    ...list(p.log, true),
    p.board,
    p.thread,
    ...list(p.tasks, true),
    ...list(p.sprints || path.join(p.dir, 'sprints'), true),
    ...list(path.join(p.dir, 'archive'), true),
  ]
}

// Every word must appear on the line, case-insensitive. A path query is one word, so
// `recall src/auth` finds every line naming a file under it.
function recall(root, query, opts) {
  const o = opts || {}
  const max = o.bytes || RECALL_BYTES
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return { hits: [], more: 0, text: '' }
  const base = path.join(paths(root).dir, '..')
  const hits = []
  for (const file of sources(root)) {
    const body = read(file)
    if (body === null) continue
    body.split(/\r?\n/).forEach((line, i) => {
      const low = line.toLowerCase()
      if (words.every((w) => low.includes(w))) {
        hits.push({ file: path.relative(base, file).replace(/\\/g, '/'), line: i + 1, text: line.trim() })
      }
    })
  }
  let text = ''
  let shown = 0
  for (const h of hits) {
    const row = h.file + ':' + h.line + '  ' + fitBytes(h.text, 200) + '\n'
    if (Buffer.byteLength(text + row, 'utf8') > max) break
    text += row
    shown++
  }
  return { hits: hits.slice(0, shown), more: hits.length - shown, text }
}

module.exports = { archive, recall, KEEP_FIXED, KEEP_HANDOFFS, THREAD_DAYS, RECALL_BYTES }
