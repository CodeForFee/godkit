'use strict'
// Walk the project, categorize each file, and pull out its imports.
//
// This is the deterministic half of building the map. Doing it in a script rather than by
// reading files into the model costs nothing and is exactly reproducible; the model's judgment
// is spent on what the code *means*, which is the part a script cannot do.

const fs = require('fs')
const path = require('path')

const CODE = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.swift',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.php', '.scala', '.ex', '.exs',
  '.vue', '.svelte', '.dart', '.lua', '.sh', '.bash', '.ps1',
])
const CONFIG = new Set([
  '.json', '.yaml', '.yml', '.toml', '.ini', '.env', '.cfg', '.properties', '.xml',
])
const DOCS = new Set(['.md', '.mdx', '.rst', '.txt', '.adoc'])
const DATA = new Set(['.csv', '.tsv', '.sql', '.parquet', '.ndjson'])
const INFRA = new Set(['.tf', '.tfvars', '.dockerfile', '.nomad'])
const INFRA_NAMES = new Set(['dockerfile', 'makefile', 'procfile', 'vagrantfile', 'jenkinsfile'])

// Always skipped, before .agentignore is even consulted: these are never worth a token.
const ALWAYS_SKIP = new Set([
  '.git', 'node_modules', '.agent', 'dist', 'build', 'out', 'target',
  'coverage', '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.cache',
  'vendor', '.idea', '.vscode', '.gradle', 'Pods',
])

const MAX_BYTES = 400 * 1024 // a file bigger than this is generated or vendored, not authored

function category(file) {
  const base = path.basename(file).toLowerCase()
  const ext = path.extname(base)
  if (INFRA_NAMES.has(base) || INFRA.has(ext)) return 'infra'
  if (CODE.has(ext)) return 'code'
  if (CONFIG.has(ext)) return 'config'
  if (DOCS.has(ext)) return 'docs'
  if (DATA.has(ext)) return 'data'
  return null // unknown types are not mapped
}

// godkit: supports the common .gitignore subset — comments, `dir/`, `*.ext`, leading `/`, and
// plain names. Not negation (`!`) or `**` mid-path. Upgrade to a real matcher only if a project
// actually needs one; ALWAYS_SKIP already covers the cases that matter.
function loadIgnore(file) {
  let lines = []
  try {
    lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  } catch {
    return () => false
  }

  const rules = []
  for (let raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('!')) continue
    const dirOnly = line.endsWith('/')
    const body = (dirOnly ? line.slice(0, -1) : line).replace(/^\//, '')
    if (!body) continue
    const rx = new RegExp(
      '^' + body.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$',
    )
    rules.push({ rx, dirOnly })
  }

  return (rel, isDir) => {
    const parts = rel.split('/')
    for (const r of rules) {
      if (r.dirOnly && !isDir && parts.length < 2) continue
      // match the whole path or any single segment, which is what gitignore does in practice
      if (r.rx.test(rel)) return true
      if (parts.some((seg) => r.rx.test(seg))) return true
    }
    return false
  }
}

const IMPORT_PATTERNS = [
  /^\s*import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/gm, // js/ts
  /^\s*export\s+[\s\S]*?from\s+['"]([^'"]+)['"]/gm,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/gm,
  /^\s*import\s+['"]([^'"]+)['"]/gm, // side-effect import
  /^\s*from\s+([\w.]+)\s+import\s+/gm, // python
  /^\s*import\s+([\w.]+)\s*$/gm,
  /^\s*use\s+([\w:]+)/gm, // rust
  /^\s*#include\s+[<"]([^>"]+)[>"]/gm, // c/c++
]

function imports(text) {
  const out = new Set()
  for (const rx of IMPORT_PATTERNS) {
    rx.lastIndex = 0
    let m
    while ((m = rx.exec(text))) if (m[1]) out.add(m[1])
  }
  return [...out]
}

// Resolve a relative import to a real file in the project, so batching can follow it.
// Bare specifiers (packages) are left alone — they say nothing about internal structure.
function resolveImport(spec, fromFile, known) {
  if (!spec.startsWith('.')) return null
  const base = path.posix.join(path.posix.dirname(fromFile), spec).replace(/\\/g, '/')
  const candidates = [base]
  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs']) {
    candidates.push(base + ext, base + '/index' + ext)
  }
  return candidates.find((c) => known.has(c)) || null
}

function scan(root, opts) {
  const options = opts || {}
  const ignored = loadIgnore(path.join(root, '.agent', '.agentignore'))
  const gitIgnored = loadIgnore(path.join(root, '.gitignore'))
  const files = []

  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return // unreadable dir: skip it rather than fail the whole scan
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name)
      const rel = path.relative(root, abs).replace(/\\/g, '/')
      if (ALWAYS_SKIP.has(e.name)) continue
      if (ignored(rel, e.isDirectory()) || gitIgnored(rel, e.isDirectory())) continue
      if (e.isDirectory()) {
        walk(abs)
        continue
      }
      if (!e.isFile()) continue

      const cat = category(rel)
      if (!cat) continue
      let stat
      try {
        stat = fs.statSync(abs)
      } catch {
        continue
      }
      if (stat.size > MAX_BYTES) continue
      files.push({ path: rel, category: cat, bytes: stat.size, abs })
    }
  }

  walk(root)
  files.sort((a, b) => a.path.localeCompare(b.path))

  const known = new Set(files.map((f) => f.path))
  for (const f of files) {
    f.imports = []
    if (f.category !== 'code') continue
    let text
    try {
      text = fs.readFileSync(f.abs, 'utf8')
    } catch {
      continue
    }
    f.lines = text.split('\n').length
    f.imports = imports(text)
      .map((s) => resolveImport(s, f.path, known))
      .filter(Boolean)
  }

  if (!options.keepAbs) for (const f of files) delete f.abs

  const languages = {}
  for (const f of files) {
    if (f.category !== 'code') continue
    const ext = path.extname(f.path)
    languages[ext] = (languages[ext] || 0) + 1
  }

  return { root, files, languages, count: files.length }
}

module.exports = { scan, category, imports, resolveImport, loadIgnore, ALWAYS_SKIP }
