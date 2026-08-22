'use strict'
// A managed block is godkit's few lines inside a file the user also owns. `godkit init` used to
// skip any host file that already existed, which quietly meant "this project gets no rules"; and
// overwriting instead would eat whatever the user wrote there. A marked block does neither: we
// own what is between the markers and never touch a byte outside them.

const MARKERS = {
  html: ['<!-- godkit:start -->', '<!-- godkit:end -->'],
  hash: ['# godkit:start', '# godkit:end'],
}

function markersFor(style) {
  const pair = MARKERS[style || 'html']
  if (!pair) throw new Error('unknown managed-block style: ' + style)
  return pair
}

function countOf(text, needle) {
  let n = 0
  let at = text.indexOf(needle)
  while (at !== -1) {
    n++
    at = text.indexOf(needle, at + needle.length)
  }
  return n
}

// Refuses anything it cannot rewrite unambiguously rather than guessing: a second block, an
// unbalanced pair, or an end before its start all mean a human edited the markers by hand.
function locate(text, style) {
  const [open, close] = markersFor(style)
  const opens = countOf(text, open)
  const closes = countOf(text, close)
  if (!opens && !closes) return null
  if (opens !== 1 || closes !== 1) {
    throw new Error('malformed godkit block: found ' + opens + ' start and ' + closes + ' end markers')
  }
  const start = text.indexOf(open)
  const end = text.indexOf(close)
  if (end < start) throw new Error('malformed godkit block: end marker precedes start marker')
  return { start, end: end + close.length, open, close }
}

function readBlock(text, style) {
  const found = locate(String(text == null ? '' : text), style)
  if (!found) return null
  return String(text).slice(found.start + found.open.length, found.end - found.close.length).replace(/^\r?\n|\r?\n$/g, '')
}

function render(body, style) {
  const [open, close] = markersFor(style)
  return open + '\n' + String(body).replace(/\s+$/, '') + '\n' + close
}

// Returns the whole new file text plus what happened. Never mutates anything outside the markers,
// and reports 'unchanged' when the body already matches so callers can stay quiet.
function applyBlock(existing, body, style) {
  const text = existing == null ? null : String(existing)
  const block = render(body, style)

  if (text === null) return { text: block + '\n', action: 'created' }

  const found = locate(text, style)
  if (!found) {
    const separator = text.length && !text.endsWith('\n') ? '\n\n' : text.length ? '\n' : ''
    return { text: text + separator + block + '\n', action: 'appended' }
  }

  const current = text.slice(found.start, found.end)
  if (current === block) return { text, action: 'unchanged' }
  return { text: text.slice(0, found.start) + block + text.slice(found.end), action: 'updated' }
}

// Drops the block and the blank line it left behind. Returns null when there was nothing to remove.
function removeBlock(existing, style) {
  const text = existing == null ? null : String(existing)
  if (text === null) return null
  const found = locate(text, style)
  if (!found) return null
  const before = text.slice(0, found.start).replace(/\n{2,}$/, '\n')
  const after = text.slice(found.end).replace(/^\r?\n+/, '\n')
  return (before + after).replace(/^\n+/, '')
}

module.exports = { MARKERS, markersFor, locate, readBlock, render, applyBlock, removeBlock }
