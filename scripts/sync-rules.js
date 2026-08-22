#!/usr/bin/env node
'use strict'
// AGENTS.md is the single source for every host's always-on rule file.
// Run with no flag to regenerate the copies; run with --check to fail if any drifted (CI).
//
// Generating beats hand-maintaining: a copy that can only be produced cannot be edited in the
// wrong place, so --check only ever fails when someone forgot to re-run it.

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'AGENTS.md')
const HEADER = path.join(ROOT, 'templates', 'rules', 'cursor-header.md')

// target -> whether it takes Cursor's .mdc frontmatter
const TARGETS = [
  ['CLAUDE.md', false],
  ['.cursor/rules/godkit.mdc', true],
  ['.agents/rules/godkit.md', false],
  ['.github/copilot-instructions.md', false],
]

function build(body, header, withHeader) {
  return withHeader ? header.trimEnd() + '\n\n' + body : body
}

function main() {
  const check = process.argv.includes('--check')
  const body = fs.readFileSync(SOURCE, 'utf8')
  const header = fs.readFileSync(HEADER, 'utf8')

  const drifted = []
  for (const [rel, withHeader] of TARGETS) {
    const file = path.join(ROOT, rel)
    const want = build(body, header, withHeader)
    let have = null
    try {
      have = fs.readFileSync(file, 'utf8')
    } catch {
      /* missing counts as drifted */
    }

    if (have === want) continue
    if (check) {
      drifted.push(rel + (have === null ? ' (missing)' : ''))
      continue
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, want)
    console.log('wrote ' + rel)
  }

  if (drifted.length) {
    console.error(
      'Rule copies are stale:\n  ' +
        drifted.join('\n  ') +
        '\nRun `node scripts/sync-rules.js` and commit the result.',
    )
    process.exit(1)
  }
  console.log(check ? 'rule copies: in sync' : 'rule copies: up to date')
}

main()
