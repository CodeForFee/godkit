'use strict'
// A team of agents: the leader cuts the plan into file-disjoint waves, runs the implementers of a
// wave at the same time (each in its own worktree, merged as they finish), loops back to code when
// the tester fails, and hands back a branch. Every member gets the skills of its role preloaded.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const tmp = (p) => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), p)))
const rm = (d) => fs.rmSync(d, { recursive: true, force: true })

// Jobs and subagent slots live under GODKIT_HOME: keep them out of the real ~/.godkit.
const HOME = tmp('godkit-team-home-')
process.env.GODKIT_HOME = HOME
process.on('exit', () => rm(HOME))

const team = require('../lib/team')
const jobs = require('../lib/jobs')

function repo() {
  const d = tmp('godkit-team-')
  const sh = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8' }).trim()
  sh('init', '-q')
  sh('config', 'user.email', 't@example.com')
  sh('config', 'user.name', 't')
  fs.writeFileSync(path.join(d, 'a.js'), 'one\n')
  sh('add', 'a.js')
  sh('commit', '-qm', 'init')
  return { d, sh }
}

// --- the plan, the waves, the verdicts --------------------------------------------------------------

test('the planner\'s json block is read, the last one wins, and paths are normalised', () => {
  const text = 'Subagent report from "godkit-planner" (...):\nfirst idea\n```json\n{"seams":[{"task":"old"}]}\n```\nbetter:\n```json\n' +
    '{"seams":[{"id":"S1","task":"add x","files":["./src\\\\x.js","src/x.js"]},{"id":"S2","task":"docs","files":["docs/**"],"after":["S1"]}],"check":"npm test"}\n```'
  const plan = team.parsePlan(text)
  assert.equal(plan.check, 'npm test')
  assert.deepEqual(plan.seams.map((s) => s.id), ['S1', 'S2'])
  assert.deepEqual(plan.seams[0].files, ['src/x.js'], 'duplicates and ./ and backslashes are folded together')
  assert.deepEqual(plan.seams[1].files, ['docs'])
  assert.deepEqual(plan.seams[1].after, ['S1'])
  assert.equal(team.parsePlan('no json here'), null)
  assert.equal(team.parsePlan('```json\n{"seams":[]}\n```'), null, 'no seams is no plan')
})

test('waves: disjoint files run together, shared files and folders wait, `after` orders, no files runs alone', () => {
  const s = (id, files, after) => ({ id, task: id, files, after: after || [] })
  const ids = (w) => w.map((wave) => wave.map((x) => x.id).join('+'))
  assert.deepEqual(ids(team.waves([s('A', ['a.js']), s('B', ['b.js']), s('C', ['c.js'])])), ['A+B+C'])
  assert.deepEqual(ids(team.waves([s('A', ['a.js']), s('B', ['a.js']), s('C', ['c.js'])])), ['A+C', 'B'])
  assert.deepEqual(ids(team.waves([s('A', ['src']), s('B', ['src/b.js'])])), ['A', 'B'], 'a folder overlaps the files in it')
  assert.deepEqual(ids(team.waves([s('A', ['a.js']), s('B', ['b.js'], ['A'])])), ['A', 'B'])
  assert.deepEqual(ids(team.waves([s('A', []), s('B', ['b.js']), s('C', ['c.js'])])), ['A', 'B+C'], 'a seam that names no files cannot be proven disjoint')
})

test('verdicts are read from the member\'s first lines; anything unclear does not pass', () => {
  const r = (body) => 'Subagent report from "x" (its own words):\n' + body
  assert.equal(team.verdict(r('PASS\nnpm test: 12 passing'), 'PASS', 'FAIL'), true)
  assert.equal(team.verdict(r('FAIL: 2 failing'), 'PASS', 'FAIL'), false)
  assert.equal(team.verdict(r('ran the tests\nlooks fine'), 'PASS', 'FAIL'), null)
  assert.equal(team.verdict(r('CHANGES\nCritical a.js:3'), 'APPROVE', 'CHANGES'), false)
  assert.equal(team.verdict(r('APPROVE — clean'), 'APPROVE', 'CHANGES'), true)
  // From a real Codex tester: the verdict is PASS; "0 fail" below it is output, not a verdict.
  assert.equal(team.verdict(r('PASS\n\n`node --test test/math.test.js test/text.test.js` → 3 pass, 0 fail.'), 'PASS', 'FAIL'), true)
  assert.equal(team.verdict(r('**FAIL** — 1 of 3 tests pass'), 'PASS', 'FAIL'), false)
  assert.equal(team.verdict(r('All 3 pass, nothing to FAIL here'), 'PASS', 'FAIL'), null, 'a verdict word in the middle of a sentence is not the verdict')
})

// --- the team file and the skills -------------------------------------------------------------------

test('the default team names an agent for every role, and a project\'s .agent/team.md replaces it', () => {
  const { d } = repo()
  const t = team.loadTeam(d)
  assert.equal(t.name, 'default')
  assert.deepEqual(Object.fromEntries(team.ROLES.map((r) => [r, t.roles[r].agent])), { plan: 'godkit-planner', code: 'godkit-implementer', test: 'godkit-tester', review: 'godkit-reviewer' })
  assert.equal(t.parallel, 4)
  assert.equal(t.rounds, 2)

  fs.mkdirSync(path.join(d, '.agent'))
  fs.writeFileSync(path.join(d, '.agent', 'team.md'), '---\nname: mine\ndescription: d\nplan: godkit-planner\ncode: godkit-implementer\ntest: godkit-tester\nreview: godkit-reviewer\nreview-skills: godkit-triage\nparallel: 99\nrounds: 0\n---\n')
  const own = team.loadTeam(d)
  assert.equal(own.name, 'mine')
  assert.deepEqual(own.roles.review.skills, ['godkit-triage'])
  assert.equal(own.parallel, 8, 'clamped')
  assert.equal(own.rounds, 0, 'zero is a real choice, not a missing value')

  fs.writeFileSync(path.join(d, '.agent', 'team.md'), '---\nname: broken\ndescription: d\nplan: godkit-planner\n---\n')
  assert.throws(() => team.loadTeam(d), /no agent for the "code" role/)
  rm(d)
})

test('every shipped role preloads the godkit skills that fit it, in full', () => {
  const sub = require('../lib/subagent')
  const want = {
    'godkit-planner': ['godkit-plan', 'godkit-map', 'godkit-lazy', 'godkit-doubt'],
    'godkit-implementer': ['godkit-execute', 'godkit-lazy', 'godkit-test', 'godkit-output-enforcement'],
    'godkit-tester': ['godkit-test', 'godkit-execute'],
    'godkit-reviewer': ['godkit-review', 'godkit-test', 'godkit-doubt'],
    'godkit-explorer': ['godkit-map'],
  }
  const { d } = repo()
  for (const [name, skills] of Object.entries(want)) {
    const text = sub.skillsText(sub.findAgent(d, name).def, d)
    for (const s of skills) assert.match(text, new RegExp('## Skill: ' + s + '\\n'), name + ' preloads ' + s)
  }
  // Not cut short: the end of the longest shipped skill is there.
  const review = fs.readFileSync(path.join(__dirname, '..', 'skills', 'godkit-review', 'SKILL.md'), 'utf8').trim().split('\n').pop()
  assert.ok(sub.skillsText(sub.findAgent(d, 'godkit-reviewer').def, d).includes(review), 'the whole skill, not its first 6KB')
  rm(d)
})

test('a UI goal adds godkit-frontend to plan, code and review; trusted project skills are added too', () => {
  const t = team.loadTeam(os.tmpdir())
  assert.ok(team.skillsFor(t, 'code', 'redesign the landing page', []).includes('godkit-frontend'))
  assert.ok(team.skillsFor(t, 'review', 'fix the CSS layout', []).includes('godkit-frontend'))
  assert.ok(!team.skillsFor(t, 'test', 'fix the CSS layout', []).includes('godkit-frontend'))
  assert.ok(!team.skillsFor(t, 'code', 'fix the token refresh race', []).includes('godkit-frontend'))
  assert.deepEqual(team.skillsFor(t, 'code', 'x', ['release-check']), ['release-check'])
})

// --- whole runs, with a stand-in agent CLI ----------------------------------------------------------

const BASE = tmp('godkit-team-fake-')
process.on('exit', () => rm(BASE))
const TIMELINE = path.join(BASE, 'timeline.txt')
const script = path.join(BASE, 'agent.js')
fs.writeFileSync(
  script,
  `const fs = require('fs')
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const mark = (s) => fs.appendFileSync(${JSON.stringify(TIMELINE)}, s + ' ' + Date.now() + '\\n')
let p = ''
process.stdin.on('data', (c) => (p += c))
process.stdin.on('end', () => {
  const skills = [...p.matchAll(/## Skill: ([\\w-]+)/g)].map((m) => m[1]).join(',')
  if (p.includes('subagent "godkit-planner"')) {
    console.log('plan below')
    console.log('\`\`\`json')
    console.log(JSON.stringify({ seams: [{ id: 'S1', task: 'make one.txt', files: ['one.txt'] }, { id: 'S2', task: 'make two.txt', files: ['two.txt'] }], check: 'node -e 0' }))
    console.log('\`\`\`')
  } else if (p.includes('subagent "godkit-implementer"')) {
    const seam = (/Your seam ([\\w-]+)/.exec(p) || [])[1]
    mark(seam + ' start')
    sleep(700)
    if (seam === 'S1') fs.writeFileSync('one.txt', 'one\\n')
    else if (seam === 'S2') fs.writeFileSync('two.txt', 'two\\n')
    else fs.writeFileSync('fixed.txt', 'fixed\\n')
    mark(seam + ' end')
    console.log('did ' + seam + ' skills=' + skills)
  } else if (p.includes('subagent "godkit-tester"')) {
    const ok = ['one.txt', 'two.txt', 'fixed.txt'].every((f) => fs.existsSync(f))
    console.log((ok ? 'PASS' : 'FAIL') + '\\nfiles: ' + fs.readdirSync('.').filter((f) => f.endsWith('.txt')).join(' ') + ' skills=' + skills)
  } else if (p.includes('subagent "godkit-reviewer"')) {
    console.log('APPROVE\\nclean skills=' + skills)
  } else console.log('who am I')
})
`,
)
const HOSTS = path.join(BASE, 'hosts.js')
fs.writeFileSync(HOSTS, `module.exports = { fake: { bin: process.execPath, shell: false, build: () => ({ args: [${JSON.stringify(script)}], stdin: true }) } }\n`)

test('a background member is a job: it starts at once and its result arrives through wait', () => {
  const { d } = repo()
  const job = jobs.start('agent', { name: 'godkit-reviewer', task: 'look', cwd: d, host: 'fake', hostsModule: HOSTS })
  assert.match(job.id, /^agent-\d{12}-[0-9a-f]{6}$/)
  const [done] = jobs.wait([job.id], 60000)
  assert.equal(done.state, 'done', JSON.stringify(done.result))
  assert.match(done.result.text, /APPROVE/)
  assert.match(done.result.text, /skills=godkit-review,godkit-test,godkit-doubt/)
  assert.ok(jobs.list().some((j) => j.id === job.id))
  assert.equal(jobs.status('nope'), null)
  rm(d)
})

test('a whole team: plan, two implementers at the same time, a failed test sent back, then pass and approve', () => {
  const { d, sh } = repo()
  fs.rmSync(TIMELINE, { force: true })
  const events = []
  const r = team.run({ goal: 'add one.txt and two.txt', cwd: d, host: 'fake', hosts: require(HOSTS), hostsModule: HOSTS, onEvent: (l) => events.push(l) })

  assert.equal(r.ok, true, events.join('\n') + '\n\n' + r.steps.map((s) => '--- ' + s.role + ' ' + s.label + '\n' + s.text).join('\n'))
  assert.equal(r.rounds, 1, 'the first test failed (no fixed.txt), one fix round made it pass')
  assert.deepEqual(r.steps.map((s) => s.role + ':' + s.label), ['plan:goal', 'code:S1', 'code:S2', 'test:round 0', 'code:fix-1', 'test:round 1', 'review:round 1'])

  // In parallel: the second implementer started before the first one finished.
  const t = Object.fromEntries(fs.readFileSync(TIMELINE, 'utf8').trim().split('\n').map((l) => { const [a, b, c] = l.split(' '); return [a + ' ' + b, Number(c)] }))
  assert.ok(Math.max(t['S1 start'], t['S2 start']) < Math.min(t['S1 end'], t['S2 end']), 'S1 and S2 overlapped in time')

  // Every member got its role's skills.
  const code = r.steps.find((s) => s.label === 'S1').text
  assert.match(code, /skills=godkit-execute,godkit-lazy,godkit-test,godkit-output-enforcement,godkit-git,godkit-handoff/)

  // The result is a branch with all of it merged; the caller's tree is untouched.
  assert.match(r.branch, /^godkit\/team-/)
  const files = sh('ls-tree', '--name-only', r.branch).split('\n')
  for (const f of ['a.js', 'one.txt', 'two.txt', 'fixed.txt']) assert.ok(files.includes(f), f + ' is on the team branch')
  assert.ok(!fs.existsSync(path.join(d, 'one.txt')), 'nothing landed in the caller\'s working tree')
  assert.doesNotMatch(sh('branch', '--list', 'godkit/godkit-implementer-*'), /godkit-implementer/, 'merged member branches are cleaned up')
  assert.match(r.text, /git merge godkit\/team-/)
  sh('worktree', 'remove', '--force', r.dir)
  rm(d)
})

test('a team with no fix rounds left stops and says so, keeping the branch to look at', () => {
  const { d, sh } = repo()
  fs.mkdirSync(path.join(d, '.agent'))
  fs.writeFileSync(path.join(d, '.agent', 'team.md'), '---\nname: strict\ndescription: d\nplan: godkit-planner\ncode: godkit-implementer\ntest: godkit-tester\nreview: godkit-reviewer\nrounds: 0\n---\n')
  const r = team.run({ goal: 'add one.txt and two.txt', cwd: d, host: 'fake', hosts: require(HOSTS), hostsModule: HOSTS })
  assert.equal(r.ok, false)
  assert.match(r.text, /^Team stopped/)
  assert.match(r.text, /tests not passing · review not reached/)
  assert.ok(r.branch, 'the work so far is kept on its branch')
  sh('worktree', 'remove', '--force', r.dir)
  rm(d)
})
