'use strict'
// The MCP server is the one door every host shares, so what matters is that the protocol is spoken
// correctly, that a bad call comes back as a tool error (not a crash), and that two agents going
// through it cannot both hold the same file.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const { respond, TOOLS } = require('../lib/mcp')

const BOARD =
  '# Board\n\n## Now (claims)\n\n| agent | scope (file globs) | task | since (UTC) | status |\n|---|---|---|---|---|\n| — | nothing claimed | — | — | the whole repo is free |\n\n## Tasks\n'

function repo() {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-mcp-')))
  execFileSync('git', ['init', '-q'], { cwd: d })
  fs.mkdirSync(path.join(d, '.agent', 'log'), { recursive: true })
  fs.writeFileSync(path.join(d, '.agent', 'BOARD.md'), BOARD)
  return d
}

let nextId = 1
const call = (name, args) => respond({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } })
const board = (d) => fs.readFileSync(path.join(d, '.agent', 'BOARD.md'), 'utf8')

test('initialize answers with the client\'s protocol version when we speak it, ours otherwise', () => {
  const a = respond({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })
  assert.equal(a.result.protocolVersion, '2024-11-05')
  assert.equal(a.result.serverInfo.name, 'godkit')
  assert.ok(a.result.capabilities.tools)
  assert.equal(respond({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }).result.protocolVersion, '2025-06-18')
})

test('a notification gets no reply; an unknown method gets a JSON-RPC error; junk gets an invalid-request error', () => {
  assert.equal(respond({ jsonrpc: '2.0', method: 'notifications/initialized' }), null)
  assert.equal(respond({ jsonrpc: '2.0', id: 3, method: 'nope' }).error.code, -32601)
  assert.equal(respond({ jsonrpc: '2.0', id: 4 }).error.code, -32600)
  assert.deepEqual(respond({ jsonrpc: '2.0', id: 5, method: 'ping' }).result, {})
})

test('every tool is listed with a schema the model can follow', () => {
  const tools = respond({ jsonrpc: '2.0', id: 6, method: 'tools/list' }).result.tools
  assert.deepEqual(tools.map((t) => t.name).sort(), ['godkit_brief', 'godkit_claim', 'godkit_log', 'godkit_map_query', 'godkit_recall', 'godkit_release', 'godkit_verify'])
  for (const t of tools) {
    assert.equal(t.inputSchema.type, 'object')
    assert.ok(t.description.length > 30, t.name + ' needs a description the model can choose by')
  }
  assert.equal(TOOLS.length, tools.length)
  assert.equal(respond({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'nope' } }).error.code, -32602)
})

test('two agents through the tool cannot hold the same file; release frees it', () => {
  const d = repo()
  const claim = (agent, scope) => call('godkit_claim', { agent, scope, task: 'work', session: agent === 'claude-opus-5' ? 'aaaa1111' : 'bbbb2222', cwd: d }).result

  const first = claim('claude-opus-5', 'lib/*')
  assert.equal(first.isError, false)
  assert.match(board(d), /claude-opus-5 \(aaaa1111\) \| lib\/\*/)

  const second = claim('codex-5.6', 'lib/guard.js')
  assert.equal(second.isError, true)
  assert.match(second.content[0].text, /Refused: claude-opus-5/)
  assert.doesNotMatch(board(d), /codex-5\.6/, 'a refused claim writes nothing')

  assert.equal(claim('codex-5.6', 'docs/').isError, false, 'a disjoint scope is fine')

  assert.match(call('godkit_release', { agent: 'claude-opus-5', cwd: d }).result.content[0].text, /Released 1/)
  assert.equal(claim('codex-5.6', 'lib/guard.js').isError, false)
  fs.rmSync(d, { recursive: true, force: true })
})

test('a bad call is a tool error with a reason, never a crash or a protocol error', () => {
  const d = repo()
  for (const args of [{ agent: 'a b', scope: 'x', task: 't' }, { agent: 'a', scope: 'x | y', task: 't' }, { agent: 'a', scope: 'x' }, {}]) {
    const r = call('godkit_claim', { ...args, cwd: d })
    assert.equal(r.error, undefined)
    assert.equal(r.result.isError, true)
  }
  const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-mcp-none-'))
  assert.match(call('godkit_brief', { cwd: nowhere }).result.content[0].text, /no \.agent\//)
  fs.rmSync(nowhere, { recursive: true, force: true })
  fs.rmSync(d, { recursive: true, force: true })
})

test('godkit_log enforces what godkit verify would: done needs evidence, partial needs what is left', () => {
  const d = repo()
  const base = { agent: 'claude-opus-5', session: 'aaaa1111-session', task: 't', did: 'lib/x.js:1 changed', cwd: d }
  assert.equal(call('godkit_log', { ...base, status: 'done' }).result.isError, true)
  assert.equal(call('godkit_log', { ...base, status: 'partial' }).result.isError, true)
  assert.equal(call('godkit_log', { ...base, status: 'done', verified: 'ran it', agent: 'claude' }).result.isError, true, 'a tool name is not a model id')
  assert.equal(call('godkit_claim', { agent: 'codex', scope: 'x', task: 't', cwd: d }).result.isError, true)

  const ok = call('godkit_log', { ...base, status: 'done', verified: '`npm test` -> 12 passing' }).result
  assert.equal(ok.isError, false)
  const files = fs.readdirSync(path.join(d, '.agent', 'log'))
  assert.equal(files.length, 1)
  assert.match(files[0], /-claude-opus-5-aaaa1111\.md$/)
  assert.match(fs.readFileSync(path.join(d, '.agent', 'log', files[0]), 'utf8'), /## Verified\n\n`npm test` -> 12 passing/)
  assert.equal(call('godkit_log', { ...base, status: 'done', verified: 'again' }).result.isError, true, 'never overwrite a log')
  assert.equal(call('godkit_verify', { cwd: d }).result.isError, false, 'the log it wrote passes godkit verify')
  fs.rmSync(d, { recursive: true, force: true })
})

test('recall finds what a log said, and map_query says plainly when there is no map', () => {
  const d = repo()
  call('godkit_log', { agent: 'claude-opus-5', session: 'aaaa1111-session', task: 'find the zebra', did: 'lib/zebra.js:3 added', status: 'done', verified: 'ran it -> ok', cwd: d })
  assert.match(call('godkit_recall', { query: 'zebra', cwd: d }).result.content[0].text, /zebra/)
  assert.equal(call('godkit_recall', { query: 'unicorn', cwd: d }).result.content[0].text, 'no matches')
  const q = call('godkit_map_query', { query: 'anything', cwd: d }).result
  assert.equal(q.isError, true)
  assert.match(q.content[0].text, /no map yet/)
  fs.rmSync(d, { recursive: true, force: true })
})

test('the board, map and thread are resources; the skills are prompts', () => {
  const d = repo()
  const cwd = process.cwd()
  process.chdir(d)
  try {
    const list = respond({ jsonrpc: '2.0', id: 20, method: 'resources/list' }).result.resources
    assert.deepEqual(list.map((r) => r.uri), ['godkit://board', 'godkit://map', 'godkit://thread'])
    const read = respond({ jsonrpc: '2.0', id: 21, method: 'resources/read', params: { uri: 'godkit://board' } }).result.contents[0]
    assert.match(read.text, /Now \(claims\)/)
    assert.equal(respond({ jsonrpc: '2.0', id: 22, method: 'resources/read', params: { uri: 'godkit://../../etc/passwd' } }).error.code, -32002)
  } finally {
    process.chdir(cwd)
  }
  const prompts = respond({ jsonrpc: '2.0', id: 23, method: 'prompts/list' }).result.prompts
  assert.ok(prompts.some((p) => p.name === 'godkit-plan' && p.description.length > 20))
  const got = respond({ jsonrpc: '2.0', id: 24, method: 'prompts/get', params: { name: 'godkit-plan' } }).result
  assert.match(got.messages[0].content.text, /^---\nname: godkit-plan/)
  assert.equal(respond({ jsonrpc: '2.0', id: 25, method: 'prompts/get', params: { name: '../../package' } }).error.code, -32602, 'no path traversal through a prompt name')
  fs.rmSync(d, { recursive: true, force: true })
})

test('over a real stdio pipe: one JSON message per line in, one out, nothing else on stdout', async () => {
  const d = repo()
  const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'godkit.js'), 'mcp'], { cwd: d, stdio: ['pipe', 'pipe', 'pipe'] })
  const lines = []
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let at
    while ((at = buffer.indexOf('\n')) >= 0) {
      lines.push(buffer.slice(0, at))
      buffer = buffer.slice(at + 1)
    }
  })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n')
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  child.stdin.write('this is not json\n')
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'godkit_claim', arguments: { agent: 'claude-opus-5', scope: 'lib/*', task: 'x' } } }) + '\n')
  for (let i = 0; i < 100 && lines.length < 3; i++) await new Promise((r) => setTimeout(r, 50))
  child.kill()
  await new Promise((resolve) => child.once('close', resolve)) // Windows will not delete a folder a live process is standing in
  assert.equal(lines.length, 3, 'initialize, the parse error, the claim; the notification is silent')
  const [init, junk, claimed] = lines.map((l) => JSON.parse(l))
  assert.equal(init.id, 1)
  assert.equal(junk.error.code, -32700)
  assert.equal(claimed.result.isError, false)
  assert.match(board(d), /claude-opus-5 \| lib\/\*/)
  fs.rmSync(d, { recursive: true, force: true })
})
