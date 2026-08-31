#!/usr/bin/env node
'use strict'
// templates/task.md and templates/log.md are the single source for the two file formats the
// protocol is built on. godkit-handoff has to show them inline — an agent installed from npm
// never sees templates/, it lives under node_modules — so the skill carried a second copy by
// hand, and the two drifted: `exit` moved position in one and not the other, silently.
//
// Same trade as sync-rules.js: a block that can only be generated cannot be edited in the wrong
// place, so --check only ever fails when someone forgot to re-run this.
//
// Run with no flag to regenerate; --check to fail if a block drifted (CI).

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'skills', 'godkit-handoff', 'SKILL.md')

// marker name -> source template. Only the frontmatter travels: it is the machine-readable half,
// and the half `godkit verify` and lib/contract.js actually parse. The skill keeps its own worked
// body examples, which teach far better than a blank form.
const BLOCKS = [
  ['task-frontmatter', path.join(ROOT, 'templates', 'task.md')],
  ['log-frontmatter', path.join(ROOT, 'templates', 'log.md')],
]

function frontmatter(file) {
  const body = fs.readFileSync(file, 'utf8')
  const m = body.match(/^---\r?\n[\s\S]*?\r?\n---/)
  if (!m) throw new Error(path.relative(ROOT, file) + ' has no frontmatter block to sync')
  return m[0].replace(/\r\n/g, '\n')
}

function markers(name) {
  return ['<!-- godkit:' + name + ' -->', '<!-- /godkit:' + name + ' -->']
}

// Deliberately not lib/managed.js: locate() there refuses more than one marker pair per file,
// because it guards files a user co-owns. This file is entirely ours and needs two blocks.
function replaceBlock(text, name, body) {
  const [open, close] = markers(name)
  const start = text.indexOf(open)
  const end = text.indexOf(close)
  if (start === -1 || end === -1) throw new Error('missing ' + open + ' / ' + close + ' in ' + path.relative(ROOT, TARGET))
  if (end < start) throw new Error('end marker precedes start marker for ' + name)
  if (text.indexOf(open, start + open.length) !== -1) throw new Error('duplicate ' + open)

  const want = open + '\n\n```markdown\n' + body + '\n```\n\n' + close
  return text.slice(0, start) + want + text.slice(end + close.length)
}

function main() {
  const check = process.argv.includes('--check')
  const have = fs.readFileSync(TARGET, 'utf8')

  let want = have
  for (const [name, source] of BLOCKS) want = replaceBlock(want, name, frontmatter(source))

  const rel = path.relative(ROOT, TARGET).replace(/\\/g, '/')
  if (want === have) {
    console.log(check ? 'template blocks: in sync' : 'template blocks: up to date')
    return
  }
  if (check) {
    console.error(
      'Template blocks are stale:\n  ' +
        rel +
        '\nRun `node scripts/sync-templates.js` and commit the result.',
    )
    process.exit(1)
  }
  fs.writeFileSync(TARGET, want)
  console.log('wrote ' + rel)
}

main()
