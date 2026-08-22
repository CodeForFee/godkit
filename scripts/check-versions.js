#!/usr/bin/env node
'use strict'
// Every manifest that carries a version must carry the SAME version.
//
// The failure this prevents is not "one file is behind" — it is all of them being behind
// together, agreeing perfectly, while the published release has moved on. So on a tag push the
// shared version must also equal the tag.

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

// marketplace.json deliberately carries no version: extra fields fail schema validation there.
const FILES = [
  'package.json',
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
  'gemini-extension.json',
]

function main() {
  const seen = new Map()
  const missing = []

  for (const rel of FILES) {
    const file = path.join(ROOT, rel)
    let json
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      console.error('cannot read ' + rel + ': ' + err.message)
      process.exit(1)
    }
    if (!json.version) {
      missing.push(rel)
      continue
    }
    if (!seen.has(json.version)) seen.set(json.version, [])
    seen.get(json.version).push(rel)
  }

  if (missing.length) {
    console.error('no version field in:\n  ' + missing.join('\n  '))
    process.exit(1)
  }

  if (seen.size !== 1) {
    console.error('version drift:')
    for (const [v, files] of seen) console.error('  ' + v + '  ' + files.join(', '))
    process.exit(1)
  }

  const version = [...seen.keys()][0]
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    console.error('not a semver version: ' + version)
    process.exit(1)
  }

  // On a tag push, the agreed version must be the tag — otherwise all four files can be stale
  // together and this check would happily pass.
  if (process.env.GITHUB_REF_TYPE === 'tag') {
    const raw = String(process.env.GITHUB_REF_NAME || '').trim()
    const tag = raw.replace(/^v/, '')
    // An empty or unparsable tag name used to skip this check silently, which is the one case
    // where skipping is worst: something is wrong with the ref that is about to be published.
    if (!/^\d+\.\d+\.\d+/.test(tag)) {
      console.error('publishing from tag "' + raw + '", which is not a vX.Y.Z release tag')
      process.exit(1)
    }
    if (tag !== version) {
      console.error('tag ' + tag + ' does not match manifest version ' + version)
      process.exit(1)
    }
  }

  console.log('versions: all ' + FILES.length + ' manifests at ' + version)
}

main()
