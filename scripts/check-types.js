#!/usr/bin/env node
'use strict'
const path = require('node:path')
const { spawnSync } = require('node:child_process')
let compiler
try {
  compiler = require.resolve('typescript/bin/tsc')
} catch {
  process.stderr.write('TypeScript is a development dependency. Run npm ci before npm run typecheck.\n')
  process.exit(1)
}
const result = spawnSync(process.execPath, [compiler, '--project', path.join(__dirname, '..', 'tsconfig.check.json')], { stdio: 'inherit' })
if (result.error) process.stderr.write(result.error.message + '\n')
process.exitCode = result.status === null ? 1 : result.status
