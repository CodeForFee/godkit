#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { performance } = require('node:perf_hooks')

const ROOT = path.resolve(__dirname, '..')
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const option = (name) => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1] }

/** Measure an actual stdio server; RSS belongs to the child, not this benchmark driver. */
async function measureMcp(env, cwd) {
  const script = "const m = require(process.argv[1]); process.stderr.write('GODKIT_RSS:' + process.memoryUsage().rss + '\\n'); m.serve(process.stdin, process.stdout)"
  const started = performance.now()
  const child = spawn(process.execPath, ['-e', script, path.join(ROOT, 'lib', 'mcp.js')], { env, cwd, windowsHide: true })
  let buffer = '', rss = null, next = 1
  const pending = new Map()
  const closed = new Promise((resolve) => child.once('close', resolve))
  child.stderr.on('data', (chunk) => { const m = /GODKIT_RSS:(\d+)/.exec(String(chunk)); if (m) rss = Number(m[1]) })
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let at
    while ((at = buffer.indexOf('\n')) >= 0) {
      const reply = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1)
      const receiver = pending.get(reply.id)
      if (receiver) { pending.delete(reply.id); clearTimeout(receiver.timer); receiver.resolve(reply) }
    }
  })
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = next++
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP benchmark timed out: ' + method)) }, 5000)
    pending.set(id, { resolve, timer })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  child.on('error', (error) => { for (const receiver of pending.values()) { clearTimeout(receiver.timer); receiver.resolve({ error: { message: error.message } }) } })
  try {
    const initialized = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'godkit-benchmark', version: '1' } })
    if (!initialized.result || !initialized.result.serverInfo) throw new Error('Invalid MCP initialize reply')
    const initializeMs = performance.now() - started
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    const listed = await request('tools/list', {})
    if (!listed.result || !Array.isArray(listed.result.tools)) throw new Error('Invalid MCP tools/list reply')
    const ping = []
    for (let i = 0; i < 10; i++) { const before = performance.now(); const response = await request('ping', {}); if (response.error) throw new Error('MCP ping failed'); ping.push(performance.now() - before) }
    return { initializeMs, pingMedianMs: median(ping), rssBytes: rss, tools: listed.result.tools.length }
  } finally {
    for (const receiver of pending.values()) clearTimeout(receiver.timer)
    child.stdin.end()
    const timer = setTimeout(() => child.kill(), 1000)
    await closed
    clearTimeout(timer)
  }
}

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'godkit-benchmark-'))
  const env = { ...process.env, HOME: temp, USERPROFILE: temp, XDG_CONFIG_HOME: path.join(temp, 'config'), GODKIT_HOME: path.join(temp, 'godkit'), GODKIT_NO_CLAUDE_CLI: '1' }
  try {
    fs.mkdirSync(path.join(temp, '.agent', 'log'), { recursive: true })
    fs.writeFileSync(path.join(temp, '.agent', 'BOARD.md'), '# Benchmark fixture\n\n## Now (claims)\n\n## Tasks\n\n## Bugs\n')
    fs.writeFileSync(path.join(temp, '.agent', 'MAP.md'), '# Benchmark fixture\n')
    fs.writeFileSync(path.join(temp, '.agent', 'THREAD.md'), '')
    const cold = [], hook = []
    let contextBytes = 0
    for (let i = 0; i < 10; i++) {
      let before = performance.now()
      const cli = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'godkit.js'), '--version'], { env, cwd: temp, encoding: 'utf8', windowsHide: true })
      if (cli.status !== 0) throw new Error('CLI benchmark failed')
      cold.push(performance.now() - before)
      before = performance.now()
      const brief = spawnSync(process.execPath, [path.join(ROOT, 'hooks', 'brief.js')], { env, cwd: temp, input: JSON.stringify({ cwd: temp, session_id: 'benchmark-session' }), encoding: 'utf8', windowsHide: true })
      if (brief.status !== 0) throw new Error('Brief benchmark failed')
      hook.push(performance.now() - before)
      contextBytes = Buffer.byteLength(brief.stdout)
    }
    const rulesBytes = fs.statSync(path.join(ROOT, 'AGENTS.md')).size
    if (rulesBytes > 5 * 1024 || contextBytes > 4 * 1024) throw new Error('Context size budget exceeded')
    const metrics = { schemaVersion: 1, at: new Date().toISOString(), platform: process.platform, arch: process.arch, node: process.version, samples: 10,
      cliColdStartMedianMs: median(cold), briefHookMedianMs: median(hook), mcp: await measureMcp(env, temp),
      context: { scope: 'brief and always-on rules only; excludes host catalog and task skills', briefBytes: contextBytes, rulesBytes, estimatedTokens: Math.ceil((contextBytes + rulesBytes) / 4), tokenEstimateMethod: 'UTF-8 bytes / 4; estimate, not tokenizer measurement' } }
    const baseline = option('--baseline')
    if (baseline) {
      const prior = JSON.parse(fs.readFileSync(baseline, 'utf8'))
      metrics.comparison = { comparable: prior.platform === metrics.platform && prior.arch === metrics.arch && prior.node === metrics.node,
        cliMedianDeltaMs: metrics.cliColdStartMedianMs - prior.cliColdStartMedianMs, briefMedianDeltaMs: metrics.briefHookMedianMs - prior.briefHookMedianMs,
        mcpInitializeDeltaMs: metrics.mcp.initializeMs - prior.mcp.initializeMs, mcpPingDeltaMs: metrics.mcp.pingMedianMs - prior.mcp.pingMedianMs,
        mcpRssDeltaBytes: metrics.mcp.rssBytes - prior.mcp.rssBytes, contextBytesDelta: metrics.context.briefBytes + metrics.context.rulesBytes - prior.context.briefBytes - prior.context.rulesBytes }
    }
    const output = JSON.stringify(metrics, null, 2) + '\n'
    const file = option('--output')
    if (file) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, output) }
    process.stdout.write(output)
  } finally { fs.rmSync(temp, { recursive: true, force: true }) }
}
main().catch((error) => { process.stderr.write(error.message + '\n'); process.exitCode = 1 })
