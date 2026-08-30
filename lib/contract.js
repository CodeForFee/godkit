'use strict'
// The rules godkit already wrote down, made checkable. `.agent/tasks/` and `.agent/log/` were
// write-only: the templates state exit conditions, evidence and handoff are mandatory, and
// nothing ever read a file back. Tags are godkit-review's own, so a `godkit verify` finding and
// a review finding read identically.

const path = require('path')
const { paths, readContained, containedEntries, logEntries } = require('./paths')

const MAX_BYTES = 64 * 1024

// Why a blocked task stopped, so the next agent knows whether they can act on it at all.
const BLOCKERS = ['needs-decision', 'needs-evidence', 'external-wait', 'needs-owner']

function value(raw) {
  const v = String(raw == null ? '' : raw).trim()
  const quoted = v.match(/^(['"])([\s\S]*?)\1/)
  if (quoted) return quoted[2].trim()
  return v.replace(/(^|\s)#.*$/, '').trim()
}

// The frontmatter block only; a `---` later in the body is content, not a delimiter.
function parseFrontmatter(text) {
  const block = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const out = {}
  if (!block) return out
  for (const line of block[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (field) out[field[1].toLowerCase()] = value(field[2])
  }
  return out
}

// Body of one `## Heading`, or null when the heading is absent. Both are "empty" — a missing
// section and a placeholder one fail the same rule, so callers never branch on the difference.
function section(text, name) {
  const pattern = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')
  const heading = String(text || '').match(new RegExp('^##\\s*' + pattern + '\\s*$', 'mi'))
  if (!heading) return null
  const rest = String(text).slice(heading.index + heading[0].length)
  const next = rest.match(/^##\s/m)
  return next ? rest.slice(0, next.index) : rest
}

// A section holding nothing but the template's own <!-- --> comment, or bare bullet markers,
// has not been filled in. Any real word survives the strip.
function empty(body) {
  if (body === null) return true
  return !body.replace(/<!--[\s\S]*?-->/g, '').replace(/[\s\-*_>|]/g, '').length
}

function read(agentDir, file) {
  const result = readContained(agentDir, file, MAX_BYTES, false)
  return result ? result.text : null
}

function finding(kind, label, tag, message) {
  return { kind, label, tag, message }
}

function checkTask(agentDir, file) {
  const text = read(agentDir, file)
  if (text === null) return []

  const meta = parseFrontmatter(text)
  const label = meta.id || path.basename(file, '.md')
  const phase = (meta.phase || 'plan').toLowerCase()
  const started = phase !== 'plan'
  const out = []

  if (!meta.scope) out.push(finding('task', label, 'no-exit', 'scope is empty. Name the files this seam owns.'))
  if (!meta.exit) out.push(finding('task', label, 'no-exit', 'exit is empty. Name the command that proves this done.'))
  if (started && (!meta.owner || meta.owner === 'unassigned')) {
    out.push(finding('task', label, 'no-exit', 'phase: ' + phase + ' with owner unassigned. Claim it on the board or hand it back.'))
  }

  if (phase === 'done' && empty(section(text, 'Test'))) {
    out.push(finding('task', label, 'no-verify', 'phase: done, ## Test empty. Run it and paste the real output.'))
  }

  // The template: Handoff "MUST be non-empty unless phase is `done`". A plan-phase task is still
  // being written, so the rule starts once the work has.
  if (started && phase !== 'done' && empty(section(text, 'Handoff'))) {
    out.push(finding('task', label, 'resume-blocked', 'phase: ' + phase + ', ## Handoff empty. The next agent cannot start.'))
  }

  if (phase === 'blocked' && !BLOCKERS.includes(meta.blocked)) {
    out.push(finding('task', label, 'resume-blocked', 'phase: blocked with no typed reason. Set blocked: ' + BLOCKERS.join(' | ') + '.'))
  }

  return out
}

function checkLog(agentDir, file) {
  const text = read(agentDir, file)
  if (text === null) return []

  const meta = parseFrontmatter(text)
  const label = 'log/' + path.basename(file)
  const status = (meta.status || '').toLowerCase()
  const out = []

  if (status === 'done' && empty(section(text, 'Verified'))) {
    out.push(finding('log', label, 'no-verify', 'status: done, ## Verified empty. A command and its output, or it is not done.'))
  }

  // godkit-handoff: "Left / next may not be empty when status is `partial` or `blocked`".
  if ((status === 'partial' || status === 'blocked') && empty(section(text, 'Left / next'))) {
    out.push(finding('log', label, 'resume-blocked', 'status: ' + status + ', ## Left / next empty. That section is why the next agent can start.'))
  }

  return out
}

// Mirrors logEntries: bounded, link-refusing, joined off the agent dir rather than re-resolving
// the project root from inside it.
function taskEntries(agentDir) {
  return containedEntries(agentDir, path.join(agentDir, 'tasks'))
    .filter((entry) => entry.isFile && entry.name.endsWith('.md'))
    .map((entry) => entry.path)
    .sort()
}

function checkAll(root) {
  const agentDir = paths(root).dir
  const out = []
  for (const file of taskEntries(agentDir)) out.push(...checkTask(agentDir, file))
  for (const file of logEntries(agentDir)) out.push(...checkLog(agentDir, file))
  return out
}

module.exports = { BLOCKERS, parseFrontmatter, section, empty, checkTask, checkLog, checkAll, taskEntries }
