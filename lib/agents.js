'use strict'
// One subagent definition, written once in agents/*.md, projected into the form each host reads:
//   Claude Code  .claude/agents/<name>.md    (the same markdown + frontmatter)
//   Codex        .codex/agents/<name>.toml   (name, description, developer_instructions)
//   Antigravity  .agents/agents/<name>.md  (native YAML tool names and scoped instructions)
// One source; generated copies are replaced/removed only when carrying our marker. Cursor's
// custom-role file format remains unverified.

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
  return agent.head + '\n<!-- ' + MARK + ' from agents/' + agent.file + '; edit that file, then run `godkit agents sync` -->\n' + agent.body.replace(/^\n+/, '\n').trimEnd() + '\n\n' + teamBoundary(agent) + '\n'
}

function teamBoundary(agent) {
  const delegation = agent.name === 'godkit-lead'
    ? "Lead boundary: delegate only native leaf workers inside root's scope and granted allowance; root -> lead -> worker is the maximum depth. With no available slot, do useful own work or request reallocation from root. If nested spawning is unavailable, ask root to dispatch on your behalf. Never expand your own allowance."
    : 'Worker boundary: Do not spawn or delegate further agents, even to retry a failed task. Ask the lead or root to reassign work when necessary.'
  return delegation + ' Work only on assigned files and exit conditions. Use native peer messaging only for a dependency, blocker, interface agreement or evidence; otherwise report through the leader. If peer messaging is unavailable, route through root. Send paths and findings, not file dumps or repeated status. Return result, changed paths, skills used, verification and blockers in at most 10 lines. Never silently substitute an external CLI or MCP agent run. Permissions follow the parent; role instructions do not create a separate sandbox or worktree.'
}

function roleSkills(agent) {
  const declared = (agent.fields || {}).skills
  const skills = [...new Set((Array.isArray(declared) ? declared : String(declared || '').split(',')).map((s) => String(s).trim()).filter(Boolean))]
  for (const skill of skills) {
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(skill)) throw new Error('invalid skill name: ' + skill)
  }
  return skills
}

// TOML literal strings cannot hold three single quotes; fall back to an escaped basic string then.
function toCodex(agent) {
  const skills = roleSkills(agent)
  // Native children inherit the skill catalog, not Claude's frontmatter preloading. Keep names
  // here so a role loads what it needs once, without embedding every skill in every child.
  const body = [
    agent.body.trimEnd(),
    skills.length ? 'Role skills: ' + skills.join(', ') + '. Load only the SKILL.md instructions needed for your assigned task from the available skill catalog; do not paste their bodies into messages.' : '',
    teamBoundary(agent),
  ].filter((s) => s !== '').join('\n\n') + '\n'
  const instructions = body.includes("'''")
    ? '"""\n' + body.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"') + '"""'
    : "'''\n" + body + "'''"
  return [
    '# ' + MARK + ' from agents/' + agent.file + '; edit that file, then run `godkit agents sync`',
    'name = ' + JSON.stringify(agent.name),
    'description = ' + JSON.stringify(agent.description),
    'developer_instructions = ' + instructions,
    '',
  ].join('\n')
}

function toAntigravity(agent) {
  const fields = agent.fields || {}
  const tools = Array.isArray(fields.tools) ? fields.tools : String(fields.tools || '').split(',').map((s) => s.trim())
  const write = fields.permissionMode !== 'plan' && (!fields.tools || tools.some((t) => /^(Edit|Write|MultiEdit|NotebookEdit)(\(|$)/.test(t)))
  const nativeTools = ['view_file', 'grep_search', 'run_command'].concat(write ? ['replace_file_content'] : [])
  if (agent.name === 'godkit-lead') nativeTools.push('invoke_subagent')
  const skills = roleSkills(agent)
  return [
    '---',
    'name: ' + JSON.stringify(agent.name),
    'description: ' + JSON.stringify(agent.description),
    'subagent: true', 'mainAgent: false', 'model: inherit', 'commandExecutionPolicy: sandbox',
    'tools:', ...nativeTools.map((t) => '  - ' + t),
    '---', '<!-- ' + MARK + ' from agents/' + agent.file + '; run `godkit agents sync` after editing the source -->',
    agent.body.trimEnd(), '',
    skills.length ? 'Role skills: ' + skills.join(', ') + '. Before working, read only the skills this task needs: ' + skills.map((s) => '.agents/skills/' + s + '/SKILL.md').join(', ') + '. Resolve these paths from the workspace root. If absent, locate the same named skills in the host catalog or ~/.gemini/config/skills/<name>/SKILL.md. Report the skills actually used; do not paste their bodies.' : '',
    // godkit: the dependency-relative base of AGY's optional skills field is undocumented.
    // Explicit workspace paths keep role instructions usable without guessing that resolver.
    'Native team: the parent invokes this role with invoke_subagent. ' + teamBoundary(agent), '',
  ].join('\n')
}

const TARGETS = [
  ['claude', path.join('.claude', 'agents'), '.md', toClaude],
  ['codex', path.join('.codex', 'agents'), '.toml', toCodex],
  ['antigravity', path.join('.agents', 'agents'), '.md', toAntigravity],
]

function ours(file) {
  try {
    return fs.readFileSync(file, 'utf8').includes(MARK)
  } catch {
    return false
  }
}

// action: sync | clean | status. Returns one row per file with what happened (or would).
function syncAgents(root, action, dryRun, options = {}) {
  const rows = []
  const agents = action === 'clean' ? [] : sources()
  if (action === 'sync' && !dryRun && options.installSkills !== false) {
    const install = require('./install')
    const names = new Set(agents.flatMap(roleSkills))
    // The coordinator also needs the standard workflows. Keep its catalog current while each
    // worker reads only the role skills named in its instructions.
    for (const item of fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })) {
      if (item.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(item.name)) names.add(item.name)
    }
    for (const name of names) {
      const from = path.join(ROOT, 'skills', name)
      const file = path.join(root, '.agents', 'skills', name)
      if (!fs.existsSync(path.join(from, 'SKILL.md'))) throw new Error('missing role skill: ' + name)
      const result = install.installOne(from, file, false, { copy: true, label: 'godkit@' + require('../package.json').version })
      if (!result.ok) rows.push({ host: 'antigravity', file, how: 'refused', reason: result.reason })
    }
  }
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
        require('./session').atomicWriteFile(file, body, { expectedRaw: exists ? fs.readFileSync(file, 'utf8') : null })
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
      if (action !== 'status' && !dryRun) {
        if (process.env.GODKIT_INSTALL_JOURNAL) require('./install-journal').recordWrite(file, fs.readFileSync(file), null)
        fs.rmSync(file)
      }
      rows.push({ host, file, how: action === 'status' ? 'stale' : 'removed' })
    }
  }
  return rows
}

module.exports = { parseAgent, sources, toClaude, toCodex, toAntigravity, roleSkills, syncAgents, MARK }
