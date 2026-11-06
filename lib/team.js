'use strict'
// A team of agents, on any host. The leader is this file: it runs the graph in the team file
// (teams/default.md, or the project's .agent/team.md) — plan, then code in parallel waves of
// file-disjoint seams, then test, then review, and back to code when either fails. Every member is a
// godkit subagent: its own process, its own permissions, the skills of its role preloaded. So Codex,
// Antigravity or Cursor get the same team Claude Code does; the host that called `godkit team`
// only waits for the result.
//
// Nothing lands in the caller's branch. The team works in a worktree on branch godkit/team-<id>,
// each implementer in its own worktree off that one, merged in when it finishes. The result is the
// branch, for a person (or the calling agent) to review and merge.
//
// godkit: waves are cut greedily in plan order; a seam that names no files runs alone. A member
// whose merge conflicts is reported and its branch kept, not retried.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const { parseAgent } = require('./agents')
const subagent = require('./subagent')
const jobs = require('./jobs')
const { worktreeRoot, findAgentContext } = require('./paths')

const ROOT = path.resolve(__dirname, '..')
const ROLES = ['plan', 'code', 'test', 'review']
const UI = /\b(ui|ux|css|html|frontend|front-end|landing|web ?page|page|component|layout|design|styles?|animations?|tailwind|react|vue|svelte|site)\b/i
const STEP_TEXT = 1500

const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s).trim()).filter(Boolean)
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const GIT_ID = ['-c', 'user.name=godkit', '-c', 'user.email=godkit@localhost']

// --- the team file ---------------------------------------------------------------------------------

function teamFile(root) {
  const own = path.join(root, '.agent', 'team.md')
  return fs.existsSync(own) ? own : path.join(ROOT, 'teams', 'default.md')
}

function loadTeam(root) {
  const file = teamFile(root)
  const def = parseAgent(fs.readFileSync(file, 'utf8'))
  const f = def.fields
  const team = {
    name: def.name,
    description: def.description,
    file,
    body: def.body,
    parallel: clamp(Number(f.parallel) || 4, 1, 8),
    rounds: clamp(f.rounds === undefined || f.rounds === '' ? 2 : Number(f.rounds) || 0, 0, 5),
    roles: {},
  }
  for (const role of ROLES) {
    const agent = String(f[role] || '').trim()
    if (!agent) throw new Error(file + ': no agent for the "' + role + '" role (a line like `' + role + ': godkit-' + role + 'er`)')
    team.roles[role] = { agent, skills: list(f[role + '-skills']) }
  }
  return team
}

// --- skills for one member, on top of its own file's ------------------------------------------------

function trustedProjectSkills(stateRoot) {
  try {
    return require('./evolve')
      .report(stateRoot)
      .skills.filter((r) => r.trust === 'trusted')
      .map((r) => r.skill.name)
  } catch {
    return []
  }
}

function skillsFor(team, role, goal, trusted) {
  const out = [...team.roles[role].skills]
  if (UI.test(goal) && role !== 'test') out.push('godkit-frontend')
  return [...new Set(out.concat(trusted || []))]
}

// --- the plan --------------------------------------------------------------------------------------

const normPath = (p) => String(p).trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/\*\*?$/, '').replace(/\/$/, '')

// The planner ends its reply with a json block; take the last one that parses into seams.
function parsePlan(text) {
  const s = String(text || '')
  const candidates = [...s.matchAll(/```(?:json)?[ \t]*\r?\n([\s\S]*?)```/g)].map((m) => m[1]).reverse()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(s.slice(first, last + 1))
  for (const raw of candidates) {
    let j
    try {
      j = JSON.parse(raw)
    } catch {
      continue
    }
    if (!j || !Array.isArray(j.seams)) continue
    const seams = j.seams
      .slice(0, 12)
      .map((x, i) => ({
        id: String((x && x.id) || 'S' + (i + 1)).replace(/[^\w-]/g, '').slice(0, 20) || 'S' + (i + 1),
        task: String((x && x.task) || '').trim(),
        files: [...new Set(list(x && x.files).map(normPath).filter(Boolean))],
        after: list(x && x.after),
      }))
      .filter((x) => x.task)
    if (seams.length) return { seams, check: String(j.check || '').trim() }
  }
  return null
}

const overlaps = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/')

// Waves of seams that can run at the same time: no two in a wave share a file (or a folder one of
// them names), and a seam comes after every seam it names in `after`. A seam with no files runs alone.
function waves(seams) {
  const out = []
  const where = new Map()
  for (const s of seams) {
    let from = 0
    for (const dep of s.after) if (where.has(dep)) from = Math.max(from, where.get(dep) + 1)
    let w = from
    for (; w < out.length; w++) {
      const wave = out[w]
      if (!s.files.length || wave.some((o) => !o.files.length)) continue
      if (wave.some((o) => o.files.some((f) => s.files.some((g) => overlaps(f, g))))) continue
      break
    }
    if (w === out.length) out.push([])
    out[w].push(s)
    where.set(s.id, w)
  }
  return out
}

// --- what each member is told -----------------------------------------------------------------------

function planTask(goal) {
  return [
    'Team goal: ' + goal,
    '',
    'You are the planner of a team. Read the code the goal touches, then cut the work into seams that',
    'implementers will build AT THE SAME TIME, each in its own copy of the repository, merged afterwards.',
    'Two seams must not create or edit the same file unless one names the other in "after". Prefer few',
    'seams (one is right for a small goal, at most six). Each task must stand alone: an implementer sees',
    'only its own seam, not this goal or the other seams.',
    '',
    'End your reply with ONE fenced json block of exactly this shape:',
    '```json',
    '{"seams":[{"id":"S1","task":"what to change, with paths and names","files":["path/a.js"],"after":[]}],"check":"one command that passes when the goal is done"}',
    '```',
    '"files" lists every file the seam creates or edits. "after" lists seam ids that must be merged first.',
  ].join('\n')
}

function codeTask(goal, seam, check) {
  // The seam comes first: its first line becomes the member's commit message on the team branch.
  return [
    'Your seam ' + seam.id + ': ' + seam.task,
    '',
    'Team goal (for context only; do just your seam): ' + goal,
    seam.files.length ? 'Files you own: ' + seam.files.join(', ') + '. Do not edit any other file: other members own them and run at the same time.' : '',
    check ? 'The team\'s check, for when you finish: ' + check : '',
  ].filter(Boolean).join('\n')
}

function testTask(goal, base, check) {
  return [
    'Team goal: ' + goal,
    '',
    'The members\' work is merged in this worktree; `git diff ' + base + '..HEAD` shows all of it.',
    check ? 'Run the team\'s check: ' + check + ' — and the project\'s own tests.' : 'Run the project\'s own tests and whatever proves the goal is met.',
    'Add the smallest missing test if nothing exercises the change. Your first line must be PASS or FAIL.',
  ].join('\n')
}

function reviewTask(goal, base) {
  return [
    'Team goal: ' + goal,
    '',
    'Review `git diff ' + base + '..HEAD` against the goal: is it done, is it correct, does anything else break?',
    'Your first line must be APPROVE (nothing has to change) or CHANGES, then the findings, worst first.',
  ].join('\n')
}

function fixTask(goal, who, report) {
  return [
    'Team goal: ' + goal,
    '',
    'The ' + who + ' found problems with the team\'s work. Fix exactly what it reports, then run the check again.',
    '',
    'Its report:',
    String(report).slice(0, 4000),
  ].join('\n')
}

// PASS / FAIL, APPROVE / CHANGES: the word the member was told to put first, at the start of its
// first non-empty line (after the "Subagent report from" header; markdown like **PASS** or "# FAIL"
// allowed). Only there: "3 pass, 0 fail" further down is output, not a verdict. Anything else is
// unclear, and unclear counts as not passed.
function verdict(text, yes, no) {
  const body = String(text || '').replace(/^Subagent report from[^\n]*\n/, '')
  const first = body.split(/\r?\n/).find((l) => l.trim()) || ''
  const m = new RegExp('^[\\s>#*_`\\-:]*(' + yes + '|' + no + ')\\b', 'i').exec(first)
  if (!m) return null
  return m[1].toUpperCase() === yes.toUpperCase()
}

// --- git around the members -------------------------------------------------------------------------

function commitAll(dir, message) {
  if (!git(dir, ['status', '--porcelain'])) return false
  git(dir, ['add', '-A'])
  git(dir, GIT_ID.concat(['commit', '-q', '-m', message]))
  return true
}

function mergeInto(dir, branch) {
  try {
    git(dir, GIT_ID.concat(['merge', '--no-ff', '--no-edit', '-q', '-m', 'godkit team: merge ' + branch, branch]))
    return true
  } catch {
    try {
      git(dir, ['merge', '--abort'])
    } catch {
      /* nothing to abort */
    }
    return false
  }
}

function dropWorktree(from, wt) {
  try {
    git(from, ['worktree', 'remove', '--force', wt.dir])
  } catch {
    /* `git worktree prune` clears a leftover */
  }
  try {
    git(from, ['branch', '-D', wt.branch])
  } catch {
    /* already gone */
  }
}

// --- the run ---------------------------------------------------------------------------------------

// o: { goal, cwd, host, model, timeoutMs, onEvent(line), hosts + hostsModule (custom hosts, tests) }
function run(o) {
  const goal = String(o.goal || '').trim()
  if (!goal) throw new Error('the goal is empty')
  const cwd = path.resolve(o.cwd || process.cwd())
  const top = worktreeRoot(cwd)
  if (!top) throw new Error('a team works on a git repository; ' + cwd + ' is not in one')
  const say = typeof o.onEvent === 'function' ? o.onEvent : () => {}
  const team = loadTeam(top)
  for (const role of ROLES) subagent.findAgent(top, team.roles[role].agent) // fail before any work starts
  const trusted = trustedProjectSkills(findAgentContext(top).stateRoot || top)
  const dirty = git(top, ['status', '--porcelain'])
  // Members run as background jobs when they can be re-created in another process: always, unless the
  // caller handed in a host table object with no module to load it from (then one at a time).
  const parallel = !o.hosts || Boolean(o.hostsModule)
  const steps = []
  const common = { host: o.host, model: o.model, timeoutMs: o.timeoutMs }

  const record = (role, label, r) => {
    const v = role === 'test' ? verdict(r.text, 'PASS', 'FAIL') : role === 'review' ? verdict(r.text, 'APPROVE', 'CHANGES') : null
    steps.push({ role, label, agent: r.name || team.roles[role].agent, ok: Boolean(r.ok), verdict: v, ms: r.ms || 0, text: String(r.text || '').slice(0, STEP_TEXT) })
    say(role.padEnd(6) + ' ' + label + ': ' + (r.ok ? (v === null ? 'done' : v ? (role === 'test' ? 'PASS' : 'APPROVE') : role === 'test' ? 'FAIL' : 'CHANGES') : 'failed') + ' (' + Math.round((r.ms || 0) / 1000) + 's)')
    return v
  }
  const member = (role, label, task, where) => {
    const r = subagent.runAgent(Object.assign({}, common, { name: team.roles[role].agent, task, cwd: where, skills: skillsFor(team, role, goal, trusted), hosts: o.hosts }))
    record(role, label, r)
    return r
  }

  const integ = subagent.createWorktree(top, 'team')
  const base = git(integ.dir, ['rev-parse', 'HEAD'])
  say('team   ' + team.name + ' on branch ' + integ.branch + (dirty ? ' (your uncommitted changes are not part of it)' : ''))

  const conflicts = []
  // Implementers for a list of seams, `team.parallel` at a time, each merged into the team branch.
  const build = (seams, check) => {
    for (let i = 0; i < seams.length; i += team.parallel) {
      const batch = seams.slice(i, i + team.parallel)
      let results
      if (parallel) {
        const started = batch.map((s) =>
          jobs.start('agent', Object.assign({}, common, { name: team.roles.code.agent, task: codeTask(goal, s, check), cwd: integ.dir, skills: skillsFor(team, 'code', goal, trusted), hostsModule: o.hostsModule })),
        )
        say('code   started ' + batch.map((s) => s.id).join(', ') + ' in parallel')
        const limit = (o.timeoutMs || 600000) + 60000
        results = jobs.wait(started.map((j) => j.id), limit).map((j) => (j.result ? j.result : { ok: false, text: 'job ' + j.id + ' is ' + j.state }))
      } else {
        results = batch.map((s) => subagent.runAgent(Object.assign({}, common, { name: team.roles.code.agent, task: codeTask(goal, s, check), cwd: integ.dir, skills: skillsFor(team, 'code', goal, trusted), hosts: o.hosts })))
      }
      batch.forEach((s, k) => {
        const r = results[k]
        record('code', s.id, r)
        if (!r.worktree) return
        if (r.worktree.uncommitted) {
          conflicts.push({ seam: s.id, branch: r.worktree.branch, dir: r.worktree.dir })
          say('merge  ' + s.id + ': its work could not be committed; worktree ' + r.worktree.dir + ' kept')
        } else if (mergeInto(integ.dir, r.worktree.branch)) dropWorktree(integ.dir, r.worktree)
        else {
          conflicts.push({ seam: s.id, branch: r.worktree.branch, dir: r.worktree.dir })
          say('merge  ' + s.id + ': conflict, branch ' + r.worktree.branch + ' kept')
        }
      })
    }
  }

  // 1. plan
  const planned = member('plan', 'goal', planTask(goal), integ.dir)
  const plan = (planned.ok && parsePlan(planned.text)) || { seams: [{ id: 'S1', task: goal, files: [], after: [] }], check: '' }
  if (planned.ok && !parsePlan(planned.text)) say('plan   no seams in the planner\'s reply: the whole goal is one seam')
  const cut = waves(plan.seams)
  say('plan   ' + plan.seams.length + ' seam(s) in ' + cut.length + ' wave(s)' + (plan.check ? ', check: ' + plan.check : ''))

  // 2. code, wave by wave
  cut.forEach((wave, n) => {
    say('wave   ' + (n + 1) + ': ' + wave.map((s) => s.id + (s.files.length ? ' [' + s.files.join(', ') + ']' : '')).join('  '))
    build(wave, plan.check)
  })

  // 3. test and 4. review, back to code while either fails
  let passed = false
  let approved = false
  let round = 0
  for (;;) {
    const tested = member('test', 'round ' + round, testTask(goal, base, plan.check), integ.dir)
    commitAll(integ.dir, 'godkit team: tests')
    passed = tested.ok && steps[steps.length - 1].verdict === true
    let reviewed = null
    if (passed) {
      reviewed = member('review', 'round ' + round, reviewTask(goal, base), integ.dir)
      approved = reviewed.ok && steps[steps.length - 1].verdict === true
    }
    if ((passed && approved) || round >= team.rounds) break
    round++
    const who = passed ? 'reviewer' : 'tester'
    build([{ id: 'fix-' + round, task: fixTask(goal, who, (passed ? reviewed : tested).text), files: [], after: [] }], plan.check)
  }

  const ok = passed && approved && !conflicts.length
  const changed = git(integ.dir, ['rev-list', '--count', base + '..HEAD']) !== '0'
  const lines = [
    (ok ? 'Team done' : 'Team stopped') + ': ' + goal.split(/\r?\n/)[0].slice(0, 100),
    'tests ' + (passed ? 'PASS' : 'not passing') + ' · review ' + (approved ? 'APPROVE' : passed ? 'CHANGES' : 'not reached') + ' · ' + round + ' fix round(s) · ' + steps.length + ' member run(s)',
  ]
  if (conflicts.length) lines.push('Merge conflicts, branches kept: ' + conflicts.map((c) => c.seam + ' ' + c.branch).join(', '))
  if (changed) lines.push('The work is on branch ' + integ.branch + ' (worktree ' + integ.dir + '). Review it, then: git merge ' + integ.branch)
  else lines.push('No changes were made.')
  if (!ok) lines.push('The last member reports are below; read them before merging anything.')
  for (const s of steps.slice(ok ? -2 : -3)) lines.push('', '--- ' + s.role + ' ' + s.label + ' (' + s.agent + ')', s.text)

  if (!changed && !conflicts.length) dropWorktree(top, integ)
  return { ok, goal, team: team.name, branch: changed ? integ.branch : null, dir: changed ? integ.dir : null, base, rounds: round, conflicts, steps, text: lines.join('\n') }
}

module.exports = { ROLES, teamFile, loadTeam, skillsFor, trustedProjectSkills, parsePlan, waves, verdict, planTask, codeTask, run }
