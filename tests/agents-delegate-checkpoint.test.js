'use strict'
// Three things that reach outside the process: files written into a project for other tools to read,
// another agent CLI run as a child, and snapshots of the user's working tree. For each, what must
// hold is that it touches only what is its own and says plainly when it could not do the job.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const BIN = path.join(ROOT, 'bin', 'godkit.js')
const agents = require('../lib/agents')
const delegation = require('../lib/delegate')
const ck = require('../lib/checkpoint')

const tmp = (p) => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), p)))
const rm = (d) => fs.rmSync(d, { recursive: true, force: true })

// --- subagent files ---------------------------------------------------------------------------

test('an agent definition is read the way YAML block scalars are written', () => {
  const a = agents.parseAgent('---\nname: file-analyzer\ndescription: |\n  Analyzes one batch.\n  Edits nothing.\n---\n\nYou describe code.\n')
  assert.equal(a.name, 'file-analyzer')
  assert.equal(a.description, 'Analyzes one batch. Edits nothing.')
  assert.equal(a.body, 'You describe code.\n')
  assert.throws(() => agents.parseAgent('no frontmatter'))
  assert.throws(() => agents.parseAgent('---\nname: Bad Name\ndescription: x\n---\n'))
})

test('the Codex file is valid TOML text even when the body has three single quotes', () => {
  const plain = agents.toCodex({ file: 'x.md', name: 'x', description: 'a "quoted" thing', body: 'line one\n' })
  assert.match(plain, /^name = "x"$/m)
  assert.match(plain, /^description = "a \\"quoted\\" thing"$/m)
  assert.match(plain, /developer_instructions = '''\nline one\n/)
  const hard = agents.toCodex({ file: 'x.md', name: 'x', description: 'd', body: "it's '''odd''' \\ and \"\"\"too\"\"\"\n" })
  assert.match(hard, /developer_instructions = """\n/)
  assert.ok(hard.includes('\\\\'), 'backslashes are escaped in a basic string')
  assert.ok(hard.includes('\\"\\"\\"'), 'a triple double quote is escaped')
})

test('native Codex roles carry skill names and a scoped team contract without embedding skill bodies', () => {
  const role = agents.parseAgent('---\nname: specialist\ndescription: x\nskills:\n  - godkit-lazy\n  - godkit-test\n---\nDo the assigned change.\n')
  role.file = 'specialist.md'
  const rendered = agents.toCodex(role)
  assert.match(rendered, /godkit-lazy, godkit-test/)
  assert.match(rendered, /Load only.*SKILL\.md/)
  assert.match(rendered, /native.*messaging/i)
  assert.match(rendered, /through the leader/)
  assert.match(rendered, /10 lines/)
  assert.match(rendered, /Do not spawn/)
  assert.ok(!rendered.includes('## The verification ladder'), 'skills are loaded on demand, not pasted into every role')
  assert.ok(!rendered.includes('sandbox_mode'), 'a role does not promise a separate permission sandbox')

  const csv = agents.parseAgent('---\nname: csv\ndescription: x\nskills: godkit-lazy, godkit-test\n---\nWork.\n')
  csv.file = 'csv.md'
  assert.match(agents.toCodex(csv), /godkit-lazy, godkit-test/)
  csv.fields.skills = ['../outside']
  assert.throws(() => agents.toCodex(csv), /invalid skill/)
})

test('shipped roles declare skills available to both native Codex and Claude', () => {
  for (const role of agents.sources().filter((a) => a.name.startsWith('godkit-'))) {
    assert.ok(Array.isArray(role.fields.skills), role.name + ' needs a YAML skill list for Claude')
    const names = role.fields.skills
    assert.deepEqual(agents.parseAgent(agents.toClaude(role)).fields.skills, names, 'Claude needs the skill array intact')
    for (const name of names) {
      assert.ok(fs.existsSync(path.join(ROOT, 'skills', name, 'SKILL.md')), name + ' is missing')
      assert.ok(agents.toCodex(role).includes(name), 'Codex lost ' + name)
      assert.ok(agents.toClaude(role).includes(name), 'Claude lost ' + name)
    }
  }
})

test('all host projections distinguish a bounded lead from leaf workers', () => {
  const roles = agents.sources()
  const lead = roles.find((role) => role.name === 'godkit-lead')
  assert.ok(lead, 'the reusable lead role must be shipped')
  assert.ok(!lead.fields.tools, 'the Claude lead inherits native capabilities instead of a worker tool allowlist')
  for (const render of [agents.toClaude, agents.toCodex, agents.toAntigravity]) {
    const rendered = render(lead)
    assert.match(rendered, /Lead boundary:/)
    assert.match(rendered, /granted allowance/)
    assert.match(rendered, /root -> lead -> worker/)
    assert.match(rendered, /no available slot/)
    assert.match(rendered, /nested spawning is unavailable/)
    assert.match(rendered, /root to dispatch/)
    assert.match(rendered, /references\/routing\.md/)
    assert.ok(!rendered.includes('Worker boundary:'), 'the renderer must not forbid the lead delegation it just granted')
    for (const role of roles.filter((r) => r !== lead)) {
      const worker = render(role)
      assert.match(worker, /Worker boundary: Do not spawn or delegate further agents/)
      assert.ok(!worker.includes('Lead boundary:'), role.name + ' must remain a leaf')
      assert.match(worker, /10 lines/)
      assert.match(worker, /peer messaging is unavailable/)
    }
  }
})

test('agents sync writes both hosts, is idempotent, and only ever replaces or removes its own files', () => {
  const d = tmp('godkit-agents-')
  const first = agents.syncAgents(d, 'sync', false)
  const names = agents.sources().map((a) => a.name)
  assert.ok(names.length >= 2)
  assert.equal(first.filter((r) => r.how === 'created').length, names.length * 3)
  for (const n of names) {
    assert.ok(fs.existsSync(path.join(d, '.claude', 'agents', n + '.md')))
    assert.match(fs.readFileSync(path.join(d, '.codex', 'agents', n + '.toml'), 'utf8'), /developer_instructions/)
    assert.ok(fs.existsSync(path.join(d, '.agents', 'agents', n + '.md')))
  }
  assert.ok(agents.syncAgents(d, 'sync', false).every((r) => r.how === 'unchanged'))

  const mine = path.join(d, '.claude', 'agents', names[0] + '.md')
  fs.writeFileSync(mine, '---\nname: ' + names[0] + '\ndescription: my own version\n---\nhand written\n')
  const refused = agents.syncAgents(d, 'sync', false).find((r) => r.file === mine)
  assert.equal(refused.how, 'refused')
  assert.match(fs.readFileSync(mine, 'utf8'), /hand written/, 'a file we did not write is never replaced')
  assert.ok(agents.syncAgents(d, 'clean', false).every((r) => r.how !== 'refused'))
  assert.ok(fs.existsSync(mine), 'and never removed')

  const stale = path.join(d, '.codex', 'agents', 'gone.toml')
  fs.writeFileSync(stale, '# godkit-generated from agents/gone.md\nname = "gone"\n')
  assert.equal(agents.syncAgents(d, 'sync', false).find((r) => r.file === stale).how, 'removed')
  rm(d)
})

test('godkit agents status writes nothing, and init does the sync', () => {
  const d = tmp('godkit-agents-cli-')
  execFileSync('git', ['init', '-q'], { cwd: d })
  const status = execFileSync(process.execPath, [BIN, 'agents', 'status'], { cwd: d, encoding: 'utf8' })
  assert.match(status, /created/)
  assert.equal(fs.existsSync(path.join(d, '.claude')), false)
  execFileSync(process.execPath, [BIN, 'init', '--no-install'], { cwd: d, stdio: 'ignore' })
  assert.ok(fs.existsSync(path.join(d, '.claude', 'agents')))
  assert.ok(fs.existsSync(path.join(d, '.codex', 'agents')))
  assert.ok(fs.existsSync(path.join(d, '.agents', 'agents')))
  rm(d)
})

// --- delegate ---------------------------------------------------------------------------------

const SCRIPT_DIR = tmp('godkit-delegate-')
process.on('exit', () => rm(SCRIPT_DIR))
const script = path.join(SCRIPT_DIR, 'fake-agent.js')
fs.writeFileSync(
  script,
  [
    "let input = ''",
    "process.stdin.on('data', (c) => (input += c))",
    "process.stdin.on('end', () => {",
    "  const mode = process.argv[2]",
    "  if (mode === 'sleep') return setTimeout(() => {}, 5000)",
    "  if (mode === 'fail') { console.error('banner\\nthe real reason'); process.exit(3) }",
    "  if (mode === 'big') return console.log('x'.repeat(20000))",
    "  console.log('mode=' + mode + ' depth=' + (process.env.GODKIT_DELEGATE_DEPTH || '-') + ' prompt=' + JSON.stringify(input.slice(0, 400)))",
    '})',
  ].join('\n'),
)
const fake = (mode) => ({ fake: { bin: process.execPath, shell: false, build: ({ write }) => ({ args: [script, mode || (write ? 'write' : 'read')], stdin: true }) } })

test('a delegated task is read-only unless asked, carries the task, and runs one level deep', () => {
  const read = delegation.delegate({ host: 'fake', task: 'review lib/x.js', hosts: fake() })
  assert.equal(read.ok, true)
  assert.match(read.text, /mode=read depth=1/)
  assert.match(read.text, /Do not delegate further/)
  assert.match(read.text, /review lib\/x\.js/)
  assert.match(delegation.delegate({ host: 'fake', task: 't', write: true, hosts: fake() }).text, /mode=write/)
})

test('a failure comes back as a failure, with the reason from the END of the output', () => {
  const r = delegation.delegate({ host: 'fake', task: 't', hosts: fake('fail') })
  assert.equal(r.ok, false)
  assert.match(r.text, /the real reason$/)
})

test('a run that takes too long is stopped and says so; a huge answer is cut', () => {
  const slow = delegation.delegate({ host: 'fake', task: 't', hosts: fake('sleep'), timeoutMs: 400 })
  assert.equal(slow.ok, false)
  assert.match(slow.text, /timed out/)
  const big = delegation.delegate({ host: 'fake', task: 't', hosts: fake('big') })
  assert.ok(Buffer.byteLength(big.text) <= delegation.MAX_ANSWER)
})

test('bad requests are refused before anything is spawned', () => {
  assert.throws(() => delegation.delegate({ host: 'nope', task: 't' }), /unknown host/)
  assert.throws(() => delegation.delegate({ host: 'fake', task: '   ', hosts: fake() }), /empty/)
  process.env.GODKIT_DELEGATE_DEPTH = '1'
  try {
    assert.throws(() => delegation.delegate({ host: 'fake', task: 't', hosts: fake() }), /cannot delegate again/)
  } finally {
    delete process.env.GODKIT_DELEGATE_DEPTH
  }
})

test('every real host asks its CLI for read-only unless write is set, and sends no task text on the command line', () => {
  for (const [name, spec] of Object.entries(delegation.HOSTS)) {
    const ro = spec.build({ write: false, prompt: 'SECRET-TASK' })
    const rw = spec.build({ write: true, prompt: 'SECRET-TASK' })
    assert.notDeepEqual(ro.args, rw.args, name + ': write must change the flags')
    if (name !== 'agy') assert.ok(!ro.args.join(' ').includes('SECRET-TASK'), name + ': the task travels on stdin, never through a shell')
    assert.match(ro.args.join(' '), /dontAsk|read-only|plan/, name + ' read-only flag')
  }
})

test('the MCP tool refuses an unknown host as a tool error', () => {
  const { respond } = require('../lib/mcp')
  const r = respond({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'godkit_delegate', arguments: { host: 'nope', task: 't', cwd: process.cwd() } } })
  assert.equal(r.error, undefined)
  assert.equal(r.result.isError, true)
})

// --- checkpoints ------------------------------------------------------------------------------

function repo() {
  const d = tmp('godkit-ckpt-')
  const sh = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8' }).trim()
  sh('init', '-q')
  sh('config', 'user.email', 't@example.com')
  sh('config', 'user.name', 't')
  fs.mkdirSync(path.join(d, '.agent'))
  fs.writeFileSync(path.join(d, 'a.js'), 'one\n')
  sh('add', 'a.js')
  sh('commit', '-qm', 'init')
  return { d, sh, write: (f, c) => fs.writeFileSync(path.join(d, f), c), read: (f) => fs.readFileSync(path.join(d, f), 'utf8').replace(/\r\n/g, '\n') /* git's autocrlf may have restored CRLF */ }
}

test('a checkpoint captures tracked and new files without touching the index, branch or working tree', () => {
  const { d, sh, write } = repo()
  const head = sh('rev-parse', 'HEAD')
  const first = ck.snapshot(d, 'aaaa1111-session')
  assert.match(first.ref, /refs\/godkit\/checkpoints\/aaaa1111\/0001$/)

  write('a.js', 'two\n')
  write('b.js', 'new\n')
  const status = sh('status', '--porcelain')
  const second = ck.snapshot(d, 'aaaa1111-session')
  assert.match(second.ref, /0002$/)
  assert.equal(sh('status', '--porcelain'), status, 'the working tree and index are exactly as they were')
  assert.equal(sh('diff', '--cached', '--name-only'), '', 'nothing was staged')
  assert.equal(sh('rev-parse', 'HEAD'), head)
  assert.equal(sh('show', second.ref + ':b.js'), 'new', 'an untracked file is in the checkpoint')
  assert.equal(sh('ls-tree', '-r', '--name-only', second.ref).includes('.agent'), false, '.agent/ is not snapshotted')

  assert.deepEqual(ck.snapshot(d, 'aaaa1111-session'), { skipped: 'unchanged' })
  rm(d)
})

test('a checkpoint rehashes tracked content even when git cached it as unchanged', () => {
  const { d, sh, write } = repo()
  try {
    sh('update-index', '--assume-unchanged', 'a.js')
    write('a.js', 'two\n')
    assert.equal(sh('diff', '--name-only'), '', 'fixture reproduces a cached clean index')
    const checkpoint = ck.snapshot(d, 'cache111')
    assert.equal(sh('show', checkpoint.ref + ':a.js'), 'two', 'snapshot must read current bytes')
    assert.match(sh('ls-files', '-v', 'a.js'), /^h /, 'real index flags remain intact')
  } finally { rm(d) }
})

test('rewind restores what the snapshot knew, leaves what was created since, and can itself be undone', () => {
  const { d, write, read } = repo()
  const one = ck.snapshot(d, 'bbbb2222-session')
  write('a.js', 'two\n')
  write('late.js', 'created after\n')

  const entry = ck.resolve(d, 'bbbb2222/1')
  const plan = ck.plan(d, entry)
  assert.deepEqual(plan.restore, ['a.js'])
  assert.deepEqual(plan.created, ['late.js'])
  assert.equal(read('a.js'), 'two\n', 'planning changes nothing')

  const done = ck.rewind(d, entry)
  assert.equal(read('a.js'), 'one\n')
  assert.equal(read('late.js'), 'created after\n', 'a file made since is listed, never deleted')
  assert.deepEqual(done.created, ['late.js'])
  assert.ok(done.safety && done.safety.includes('rewind-'))

  const undo = ck.resolve(d, done.safety.slice(ck.NS.length + 1).replace(/\/0+/, '/'))
  ck.rewind(d, undo)
  assert.equal(read('a.js'), 'two\n', 'the safety checkpoint put it back')
  assert.ok(one.ref)
  rm(d)
})

test('only the newest N checkpoints of a session are kept', () => {
  const { d, write } = repo()
  for (let i = 0; i < 5; i++) {
    write('a.js', 'v' + i + '\n')
    ck.snapshot(d, 'cccc3333-session', { keep: 3 })
  }
  const kept = ck.list(d, 'cccc3333')
  assert.deepEqual(kept.map((e) => e.n), [3, 4, 5])
  rm(d)
})

const STATE = tmp('godkit-ckpt-state-')
process.on('exit', () => rm(STATE))
function hook(payload, env) {
  return spawnSync(process.execPath, [path.join(ROOT, 'hooks', 'checkpoint.js')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: STATE, PLUGIN_DATA: '', CODEX_HOME: '', ...env },
  })
}

test('the hook snapshots before an edit, is debounced, and does nothing in a project that never opted in', () => {
  const { d, write } = repo()
  const payload = { cwd: d, session_id: 'dddd4444-session', tool_name: 'Edit' }
  write('a.js', 'edited\n')
  assert.equal(hook(payload).status, 0)
  assert.equal(ck.list(d, 'dddd4444').length, 1)

  write('a.js', 'edited again\n')
  hook(payload)
  assert.equal(ck.list(d, 'dddd4444').length, 1, 'debounced: one per 15s')
  hook(payload, { GODKIT_CHECKPOINT_DEBOUNCE: '0' })
  assert.equal(ck.list(d, 'dddd4444').length, 2)
  hook(payload, { GODKIT_CHECKPOINT_DEBOUNCE: '0', GODKIT_CHECKPOINT: 'off' })
  assert.equal(ck.list(d, 'dddd4444').length, 2, 'GODKIT_CHECKPOINT=off')

  fs.rmSync(path.join(d, '.agent'), { recursive: true })
  write('a.js', 'third\n')
  hook({ ...payload, session_id: 'eeee5555-session' }, { GODKIT_CHECKPOINT_DEBOUNCE: '0' })
  assert.equal(ck.list(d, 'eeee5555').length, 0)
  rm(d)
})

test('godkit rewind lists, previews, and only restores with --yes', () => {
  const { d, write, read } = repo()
  ck.snapshot(d, 'ffff6666-session')
  write('a.js', 'changed\n')
  const run = (...a) => execFileSync(process.execPath, [BIN, 'rewind', ...a], { cwd: d, encoding: 'utf8' })
  assert.match(run(), /ffff6666\/1/)
  assert.match(run('ffff6666'), /would restore 1 file/)
  assert.equal(read('a.js'), 'changed\n')
  assert.match(run('last', '--yes'), /Restored 1 file/)
  assert.equal(read('a.js'), 'one\n')
  rm(d)
})
