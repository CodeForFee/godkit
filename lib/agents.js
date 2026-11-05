'use strict'
// One subagent definition, written once in agents/*.md, projected into the form each host reads:
//   Claude Code  .claude/agents/<name>.md    (the same markdown + frontmatter)
//   Codex        .codex/agents/<name>.toml   (name, description, developer_instructions)
// Same rule as the rule files and the hook files: one source, generated copies, and a copy is only
// ever replaced or removed if it carries our marker. Cursor and Antigravity are not generated:
// Cursor's definition format is not documented where we could read it, and Antigravity's CLI lists
// agents but its file format is not documented either.

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'agents')
const MARK = 'godkit-generated'

// name + description (a plain line or a | / > block) + body.
function parseAgent(text) {
  const m = /^(---\r?\n([\s\S]*?)\r?\n---)\r?\n?([\s\S]*)$/.exec(String(text))
  if (!m) throw new Error('no frontmatter')
  const lines = m[2].split(/\r?\n/)
  const out = { name: '', description: '', head: m[1], body: m[3].replace(/^\s*\n/, ''), fields: {} }
  // Every top-level key, because the same file is also read by the subagent runner (lib/subagent.js):
  // tools, model, permissionMode, isolation, skills... A value is a string, or a list when written as "- item" lines.
  for (let i = 0; i < lines.length; i++) {
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i])
    if (!field) continue
    let value = field[2].trim()
    if (/^[|>][+-]?$/.test(value)) {
      const block = []
      while (i + 1 < lines.length && /^\s+\S|^\s*$/.test(lines[i + 1])) block.push(lines[++i].trim())
      value = block.join(' ')
    } else if (value === '') {
      const items = []
      while (i + 1 < lines.length && /^\s*-\s+\S/.test(lines[i + 1])) items.push(lines[++i].replace(/^\s*-\s+/, '').trim())
      if (items.length) {
        out.fields[field[1]] = items
        continue
      }
    }
    out.fields[field[1]] = value.replace(/^(['"])(.*)\1$/, '$2').replace(/\s+/g, ' ').trim()
  }
  out.name = String(out.fields.name || '')
  out.description = String(out.fields.description || '')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(out.name)) throw new Error('name must be lowercase letters, digits, dashes')
  if (!out.description) throw new Error('no description')
  return out
}

function sources() {
  let files = []
  try {
    files = fs.readdirSync(SOURCE).filter((f) => f.endsWith('.md')).sort()
  } catch {
    return []
  }
  return files.map((file) => {
    const text = fs.readFileSync(path.join(SOURCE, file), 'utf8')
    return Object.assign({ file, text }, parseAgent(text))
  })
}

function toClaude(agent) {
  return agent.head + '\n<!-- ' + MARK + ' from agents/' + agent.file + '; edit that file, then run `godkit agents sync` -->\n' + agent.body.replace(/^\n+/, '\n')
}

// TOML literal strings cannot hold three single quotes; fall back to an escaped basic string then.
function toCodex(agent) {
  const instructions = agent.body.includes("'''")
    ? '"""\n' + agent.body.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"') + '"""'
    : "'''\n" + agent.body + "'''"
  return [
    '# ' + MARK + ' from agents/' + agent.file + '; edit that file, then run `godkit agents sync`',
    'name = ' + JSON.stringify(agent.name),
    'description = ' + JSON.stringify(agent.description),
    'developer_instructions = ' + instructions,
    '',
  ].join('\n')
}

const TARGETS = [
  ['claude', path.join('.claude', 'agents'), '.md', toClaude],
  ['codex', path.join('.codex', 'agents'), '.toml', toCodex],
]

function ours(file) {
  try {
    return fs.readFileSync(file, 'utf8').includes(MARK)
  } catch {
    return false
  }
}

// action: sync | clean | status. Returns one row per file with what happened (or would).
function syncAgents(root, action, dryRun) {
  const rows = []
  const agents = action === 'clean' ? [] : sources()
  const wanted = new Set()
  for (const [host, dir, ext, render] of TARGETS) {
    const base = path.join(root, dir)
    for (const agent of agents) {
      const file = path.join(base, agent.name + ext)
      wanted.add(file)
      const body = render(agent)
      const exists = fs.existsSync(file)
      if (exists && !ours(file)) {
        rows.push({ host, file, how: 'refused', reason: 'exists and is not ours' })
        continue
      }
      if (exists && fs.readFileSync(file, 'utf8') === body) {
        rows.push({ host, file, how: 'unchanged' })
        continue
      }
      if (action !== 'status' && !dryRun) {
        fs.mkdirSync(base, { recursive: true })
        fs.writeFileSync(file, body)
      }
      rows.push({ host, file, how: exists ? 'updated' : 'created' })
    }
    // Ours that no source asks for any more (a renamed or removed agent): remove with `clean`/`sync`.
    let present = []
    try {
      present = fs.readdirSync(base).filter((f) => f.endsWith(ext)).map((f) => path.join(base, f))
    } catch {
      /* no folder yet */
    }
    for (const file of present) {
      if (wanted.has(file) || !ours(file)) continue
      if (action !== 'status' && !dryRun) fs.rmSync(file)
      rows.push({ host, file, how: action === 'status' ? 'stale' : 'removed' })
    }
  }
  return rows
}

module.exports = { parseAgent, sources, toClaude, toCodex, syncAgents, MARK }
