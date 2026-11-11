'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execSync } = require('node:child_process')
const runtime = require('../lib/runtime')
const install = require('../lib/install')
const hostmcp = require('../lib/hostmcp')

test('installed hook and MCP run without node on PATH, including Unicode and spaces', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit runtime Việt '))
  try {
    const file = path.join(dir, 'probe.js')
    fs.writeFileSync(file, 'console.log(process.argv[2])')
    const text = execSync(install.hookCommand(dir, 'probe.js', ['works']), { encoding: 'utf8', env: { ...process.env, PATH: '' } })
    assert.equal(text.trim(), 'works')
    const cfg = JSON.parse(hostmcp.applyJson('', false, path.join(dir, 'bin/godkit.js')))
    assert.equal(cfg.mcpServers.godkit.command, runtime.nodePath())
    assert.ok(path.isAbsolute(cfg.mcpServers.godkit.command))
    assert.equal(cfg.mcpServers.godkit.args[0], path.join(dir, 'bin/godkit.js').replace(/\\/g, '/'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('git hook pins its runtime and quotes shell expansion characters', () => {
  const body = hostmcp.hookBody("/tmp/a ' $x/bin/godkit.js")
  assert.ok(body.includes('NODE=' + runtime.shellQuote(runtime.nodePath().replace(/\\/g, '/'))))
  assert.ok(body.includes("'\\''"))
  assert.match(body, /exec "\$NODE" "\$BIN" check-staged/)
})
