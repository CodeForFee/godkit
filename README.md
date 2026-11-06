<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/CodeForFee/godkit/main/assets/logo-dark.svg">
  <img src="https://raw.githubusercontent.com/CodeForFee/godkit/main/assets/logo.svg" alt="Godkit" width="104" height="104">
</picture>

# Godkit

### One memory for every coding agent

Claude Code, Codex, Cursor and Antigravity open the same repo.<br>
Godkit gives them one committed memory, hooks that make them read it,<br>
a guard that runs before their commands, and subagents whose permissions hold.

<br>

[![npm](https://img.shields.io/npm/v/@codeforfee/godkit?color=cb3837&label=npm)](https://www.npmjs.com/package/@codeforfee/godkit)
[![CI](https://github.com/CodeForFee/godkit/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/CodeForFee/godkit/actions/workflows/test.yml)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-3c873a.svg)](package.json)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-3c873a.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<br>

```bash
npx @codeforfee/godkit init
```

<br>

**[Quick start](#quick-start)** · **[Why](#why)** · **[How it works](#how-it-works)** · **[Agents](#agents-and-surfaces)** · **[Safety](#safety-guard-plan-gate-pre-commit-checkpoints)** · **[MCP](#mcp-server)** · **[Subagents](#subagents-and-delegation)** · **[Teams](#agent-teams)** · **[CLI](#cli-reference)** · **[Troubleshooting](#troubleshooting)**

</div>

<br>

---

## Quick start

```bash
cd your-project
npx @codeforfee/godkit init      # once per project; the first run also sets up the machine
npx @codeforfee/godkit doctor    # what is set up, and which agents have actually run godkit
```

Then open Claude Code, Codex, Cursor or Antigravity and write your prompt as usual. There is no
command to learn and no skill to pick: the hooks brief the agent at the start of the session, the
rules tell it what to do, and the session cannot end without a log.

| Situation | What the agent does on its own |
|:--|:--|
| **New project** (no code yet) | fills `.agent/BRIEF.md` from your first prompt, opens a sprint, builds wave 1, logs it |
| **Existing project** | maps the codebase in its first session, then does your task |
| **Fresh clone** of a godkit repo | the session hook recreates `.agent/` if it was not committed |
| **Any task** | picks the right skill from the "Which skill, when" table in its rules |
| **End of a session** | writes its log; the hook archives finished items and refreshes project skills |

> **Codex users:** Codex runs a hook only after you approve it. Open `/hooks` in the Codex CLI (or
> "Review hooks" in the Codex app) once after `init`, and again after an upgrade. `godkit doctor`
> tells you when this is still pending.

## Why

Every agent arrives blind. It does not know what the project is, what was already done, which file
someone else is holding, or what was decided last week. So work gets redone, two agents edit the
same file, and every session starts by re-reading the codebase.

Private memory does not fix this. Cursor cannot read Claude's memory, and Claude cannot read Cursor's:

```
            ✗  without godkit                        ✓  with godkit

   ┌────────┐  ┌────────┐  ┌────────┐        ┌────────┐  ┌────────┐  ┌────────┐
   │ Claude │  │ Cursor │  │ Codex  │        │ Claude │  │ Cursor │  │ Codex  │
   └───┬────┘  └───┬────┘  └───┬────┘        └───┬────┘  └───┬────┘  └───┬────┘
       │           │           │                 └───────────┼───────────┘
   ┌───┴────┐  ┌───┴────┐  ┌───┴────┐                        │
   │ private│  │ private│  │ private│                   ┌────┴─────┐
   │ memory │  │ memory │  │ memory │                   │  .agent/ │  committed
   └────────┘  └────────┘  └────────┘                   └──────────┘  in your repo
    invisible to each other                        one board, one map, one log
```

> **The only memory two tools share is the filesystem they both open.**

Instructions alone are not enough either: a rule file asks, a hook makes sure. Godkit puts the same
protocol on every agent through the strongest mechanism that agent has: hooks where it has them, an
MCP server everywhere, a git pre-commit hook and a CI check underneath all of them.

## How it works

One committed directory in your repo:

```
.agent/
├── BOARD.md               claims · task index · bugs · decisions, on one screen
├── THREAD.md              append-only conversation between agents
├── BRIEF.md               what this project is, before there is code to map
├── MAP.md                 what this codebase is (generated)
├── graph.json             the machine-readable map
├── SKILLS.md              this project's own skills (generated)
├── skills/<name>/         procedures this project repeats
├── sprints/S-001-*.md     a goal, and the waves of tasks under it
├── tasks/T-001-*.md       one per task: Plan · Execute · Review · Test · Handoff
└── log/<UTC>-<model>.md   one per session, append-only, never edited by others
```

Two rules, on every agent:

> ### Read `.agent/` before you edit. Write your log before you finish.

An agent arriving at the project gets a brief (board, map freshness, the newest logs), claims a
scope, writes its tasks out as files, and leaves a log the next agent can resume from. An edit
inside another agent's live claim is denied before it happens. A session that changed files and
wrote no log is not allowed to end.

**Append-only is deliberate.** One log file per session means two tools writing at the same moment
never conflict, and git merges them without help. The generated files (`graph.json`, `meta.json`,
`MAP.md`) are marked `-merge` in `.gitattributes` instead: a textual merge would put conflict
markers into JSON, so they are regenerated, never merged by hand.

**Identity is a model, never a tool.** Every claim, task and log is signed with the model that made
it: `claude-opus-5`, not `claude`; `codex-5.6-terra`, not `codex`. One tool runs many models with
different costs and failure modes, and the next agent reading an unproven claim needs to know which
one made it. `godkit verify` rejects a bare tool name. It checks the shape, not a list of known
model ids, because such a list goes stale within months and then starts rejecting the truth.

## What `init` sets up

In the project (committed, so a teammate who clones the repo has everything):

- `.agent/` with the board, thread and templates;
- the rules, in a marked block in `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/godkit.mdc` and
  `.agents/rules/godkit.md`. Everything outside `<!-- godkit:start -->` … `<!-- godkit:end -->` is
  yours and never touched; a block that was hand-edited into something ambiguous is refused, not guessed;
- all 16 skills in `.claude/skills/` and `.agents/skills/`;
- subagent files in `.claude/agents/` and `.codex/agents/`;
- a pre-commit hook, only if the repo has none;
- `-merge` lines in `.gitattributes` for the generated map files.

On the machine (the first time only, then refreshed by each `init` after an upgrade):

- the hooks, in each agent's user-level config, run from a stable copy in `~/.godkit/<version>/`
  (never from npx's cache, which npm prunes);
- the MCP server, registered with every agent that is installed.

Both halves only touch what godkit created. A skill directory you wrote yourself is never replaced,
another tool's hooks in the same file are left alone, and `--dry-run` shows what would happen first.

<details>
<summary><b>Doing the machine half yourself, or scripting it</b></summary>

<br>

```bash
npm install -g @codeforfee/godkit

godkit install            # the skills, once per machine
godkit hooks install      # the hooks, for every agent that is installed
godkit mcp install        # the MCP server, likewise
godkit init --no-install  # the project only, nothing outside it
godkit doctor
```

On Claude Code you can take the skills and hooks as a plugin instead:

```
/plugin marketplace add CodeForFee/godkit
/plugin install godkit@godkit
```

You still run `godkit init` per project: the plugin carries the skills and hooks, not your repo's `.agent/`.

</details>

<br>

---

## Agents and surfaces

| | Claude Code | Codex | Cursor | Antigravity |
|:--|:--|:--|:--|:--|
| **Rules** | `CLAUDE.md` | `AGENTS.md` | `.cursor/rules/godkit.mdc` | `AGENTS.md`, `.agents/rules/godkit.md` |
| **Skills** | `.claude/skills/` | `.agents/skills/` | reads `.agents/skills/<name>/SKILL.md` | reads `.agents/skills/<name>/SKILL.md` |
| **Hooks** | full set · 12 | full set · 12 | adapted · 5 | adapted · 4 |
| **Hook file** | `~/.claude/settings.json` | `~/.codex/hooks.json` | `~/.cursor/hooks.json` | `~/.gemini/config/hooks.json` |
| **Guard** | every tool | every tool | shell commands | every tool |
| **MCP** | 11 tools | 11 tools | 11 tools | 11 tools |
| **Subagent files** | `.claude/agents/` | `.codex/agents/` | via `godkit agent run` | via `godkit agent run` |

Claude Code and Codex read the same hook JSON. Cursor and Antigravity speak their own hook dialects;
`hooks/adapt.js` translates their input into the shape godkit's scripts read and translates the
answer back (`additional_context` for Cursor, `injectSteps` for Antigravity; `followup_message` or
`decision: "continue"` to ask for the log, at most three times in a row).

- **Cursor** gets `sessionStart`, `postToolUse`, `stop`, `sessionEnd`, and the guard on
  `beforeShellExecution`, filtered to commands that look dangerous. A change made only by a shell
  command is not tracked there.
- **Antigravity** gets `SessionStart`, `PostToolUse`, `Stop` and `PreToolUse` (the guard, and the
  snapshot that sees a change made by a shell command).

Cursor and Antigravity are registered only when `~/.cursor` or `~/.gemini/antigravity` exist, or
when `$CURSOR_HOME` / `$GEMINI_HOME` point somewhere. `$CLAUDE_CONFIG_DIR` and `$CODEX_HOME` are
honoured too. [`docs/agent-portability.md`](docs/agent-portability.md) has the per-tool detail.

### CLI, VS Code extension, desktop app

Hooks and the MCP server live in each agent's **user-level** config, so the CLI, the VS Code
extension and the desktop app of the same agent all read them. Registered is not the same as
running, though, and `godkit doctor` shows the difference: it lists "last seen" per agent and per
surface, which is proof that a session really ran godkit.

```bash
godkit doctor        # hooks registered, Codex approval pending or not, last seen per agent
godkit autoinit on   # set up any git project at its first agent session, with no `init` typed
```

`autoinit` is off by default because it writes files into a project you did not choose.
The per-surface table is in [`docs/agent-portability.md`](docs/agent-portability.md#surfaces-cli-vs-code-extension-desktop-app).

## What the hooks do

| Hook | Event | Does |
|:--|:--|:--|
| `brief.js` | `SessionStart` | injects the board, map freshness, the newest logs and this project's skills; runs again after compaction |
| `lazy-activate.js` | `SessionStart` | resolves the `godkit-lazy` level and injects its rules |
| `lazy-subagent.js` | `SubagentStart` | injects the same rules into spawned subagents |
| `guard.js` | `PreToolUse` | denies dangerous commands and edits inside another agent's claim ([Safety](#safety-guard-plan-gate-pre-commit-checkpoints)) |
| `checkpoint.js` | `PreToolUse` (edits) | saves a file checkpoint before the agent edits |
| `work-track.js` | `PreToolUse`, `PostToolUse`, `SessionEnd` | records whether *this* session changed project files |
| `lazy-mode-tracker.js` | `UserPromptSubmit` | tracks `/godkit-lazy` level switches |
| `map-watch.js` | `PostToolUse` (Bash) | after a commit or merge, says whether the map went stale |
| `clockout.js` | `Stop` | blocks the end of the turn if this session changed files and wrote no log |

`clockout.js` judges the session, not the directory: a dirty file someone else left is not evidence
about you, and a log naming a different session does not clock you out.

**Hooks never throw.** Malformed input, missing git, no `.agent/`: all exit 0. A broken hook must not
break the session it was meant to help. Installing is safe to repeat: it drops its own previous
entries first, writes a `.bak`, matches other tools' entries one handler at a time, and writes by
temp-and-rename against the bytes it read, so a file edited underneath it is never clobbered.

```bash
godkit hooks status              # how many are registered, and where
godkit hooks install --dry-run
godkit hooks uninstall
```

<br>

---

## Safety: guard, plan gate, pre-commit, checkpoints

### Guard

`hooks/guard.js` runs before a tool call and denies it outright:

- `git push --force` (use `--force-with-lease`), `git reset --hard`, `git clean -f`;
- `rm -r` on a root or home folder, and a download piped into a shell;
- writes to `.git/`, `.env`, credential files and shell startup files;
- an edit inside a live claim held by another session.

Claims carry the session that made them, which is how the guard tells whose files are whose. A claim
older than 24 hours is stale and blocks nobody. `GODKIT_GUARD=off` turns the guard off.

### Plan gate

An agent that owns a task whose phase is still `plan` is denied edits to that task's scope until the
task moves to `execute`. It binds only the owner, only inside that scope: plan mode for agents that
have none.

### Pre-commit and CI

```bash
godkit githook install   # init does it, only when the repo has no pre-commit hook
```

The pre-commit hook lists staged files that no live claim covers. It warns by default;
`GODKIT_STRICT=1` or `git config godkit.strict true` makes it block. It says nothing while nobody
holds a claim, fails open when godkit or node is missing, and never replaces a hook that is not its
own. This catches every agent, including one with no hooks and no MCP. In CI:

```yaml
- run: npx -y @codeforfee/godkit verify   # non-zero when a task or log says done without evidence
```

### Checkpoints and rewind

Before an agent edits, `hooks/checkpoint.js` saves the working tree as a commit under
`refs/godkit/checkpoints/<session>/<n>`, built from a copy of the index. Your branch, index and
working tree are untouched and nothing shows in `git log`. At most one every 15 seconds
(`GODKIT_CHECKPOINT_DEBOUNCE`), the last 50 per session.

```bash
godkit rewind                 # list sessions and checkpoints
godkit rewind <session>/<n>   # what it would restore
godkit rewind <session>/<n> --yes
```

A rewind does nothing without `--yes`, and takes a safety checkpoint first so it can be undone.
Files created since are listed and left alone; gitignored files are not part of a checkpoint.
`GODKIT_CHECKPOINT=off` turns it off.

<br>

---

## MCP server

All four agents speak MCP, so godkit gives them the protocol as tools with checked input instead of
Markdown to hand-edit. It also works where hooks do not run (Cursor's cloud agents, for one).

```bash
godkit mcp install                  # every installed agent; init does it too
godkit mcp install --codex-approve  # also let Codex call godkit's tools without asking each time
godkit mcp                          # run the server on stdio
```

| Tool | Does |
|:--|:--|
| `godkit_brief` | the session brief: board, map freshness, newest logs |
| `godkit_claim` | claim a scope; refuses one that overlaps another agent's live claim |
| `godkit_release` | release your claim |
| `godkit_log` | write this session's log |
| `godkit_recall` | search all history for a file or words |
| `godkit_map_query` | look up the project map |
| `godkit_verify` | check that every "done" has evidence |
| `godkit_agent` | run a named subagent with its permissions enforced; `background` to start several at once |
| `godkit_delegate` | hand a task to another agent CLI |
| `godkit_team` | run a team of agents on a goal, in the background |
| `godkit_jobs` | status and results of background members and teams |

The board, map and thread are also MCP resources, and the skills are MCP prompts. The server is
written against the standard library, like the rest of godkit.

`--codex-approve` changes a Codex safety setting (tool approval for godkit's server only), so it is
off unless you pass it; `--no-codex-approve` turns it back off, and `GODKIT_CODEX_APPROVE=1|0`
overrides it per run.

## Subagents and delegation

### Named subagents

```bash
godkit agent list
godkit agent run godkit-reviewer "review lib/auth/token.js"
godkit agent model codex gpt-5.6-terra   # the model godkit's Codex children use
```

This is Claude Code's subagent harness for agents whose own is thinner, Codex above all. The files
are the same markdown files Claude reads (`.claude/agents/`, `.agent/agents/`, `~/.claude/agents/`),
plus five godkit ships: `godkit-explorer`, `godkit-planner`, `godkit-implementer`,
`godkit-tester`, `godkit-reviewer`. Running one starts a **separate agent process** (`codex exec` or `claude -p`)
and enforces what the file says:

- `tools` and `permissionMode` decide the sandbox: read-only unless the file lists `Edit` or `Write`;
- `isolation: worktree` runs it in a git worktree on its own branch, removed if untouched, otherwise
  committed for you to `git merge`;
- `skills` are preloaded into its prompt in full, and `memory` reads the same `agent-memory` folders Claude uses;
- only a 6 KB report comes back, with any fake system text in it defused;
- nesting stops at 3 deep (`GODKIT_AGENT_MAX_DEPTH`) and 20 at once (`GODKIT_AGENT_MAX_CONCURRENT`).

Checked on real Codex: a read-only agent could not create a file even when told to, a write agent
could, and an isolated agent fixed a bug in its worktree while the caller's copy stayed as it was.
Not reproduced: per-agent hooks and MCP servers, fork, resume, background runs.

`godkit agents sync` writes the subagents the map skill uses (`file-analyzer`, `architect`) in the
Claude form and the Codex form (`.toml` with `developer_instructions`). A file not marked as
generated is never replaced. Cursor and Antigravity are not generated: their formats are not
documented where they could be checked, so they run subagents through `godkit agent run`.

### Delegation

```bash
godkit delegate claude "review lib/x.js"           # read-only
godkit delegate codex "fix the failing test" --write
```

For agents with no subagent of their own, or when a second model should look at the work.
Read-only is enforced by the target CLI, not by asking: `claude` with `dontAsk` and read tools only,
`codex --sandbox read-only`, `gemini --approval-mode plan`, `agy --mode plan`. The task travels on
stdin, the answer is capped at 6 KB, and a delegated agent cannot delegate again. The model comes
from `GODKIT_<HOST>_MODEL` (for example `GODKIT_CODEX_MODEL`) or from `godkit agent model`.

## Agent teams

One subagent at a time is not a team. `godkit team` is: a leader that runs a graph of roles, with
the members of a wave working **at the same time**, on any host. Codex, Antigravity and Cursor get
the same team Claude Code does, because every member is a godkit subagent process.

```bash
godkit team                                  # the team graph and who fills each role
godkit team run "add rate limiting to the API"
godkit team run "..." --background           # returns a job id; godkit agent wait <id>
```

```
goal ─► plan ─► wave 1: code S1 · code S2 · code S3 (in parallel) ─► wave 2 ... ─► test ─► review ─► branch
                                       ▲                                              │
                                       └───────── FAIL or CHANGES, at most `rounds` ──┘
```

| Role | Agent | Skills it preloads |
|:--|:--|:--|
| plan | `godkit-planner` | godkit-plan, godkit-map, godkit-lazy, godkit-doubt, godkit-handoff, godkit-git |
| code | `godkit-implementer` | godkit-execute, godkit-lazy, godkit-test, godkit-output-enforcement, godkit-git, godkit-handoff |
| test | `godkit-tester` | godkit-test, godkit-execute, godkit-lazy, godkit-output-enforcement |
| review | `godkit-reviewer` | godkit-review, godkit-test, godkit-doubt, godkit-refactor, godkit-lazy |

- **The plan** comes back as seams, each with the files it owns. Seams whose files do not overlap
  form a wave and run in parallel (up to `parallel`, default 4), each implementer in its own git
  worktree; a seam that shares a file, or names another in `after`, waits for a later wave.
- **Merging** happens as members finish, into a team branch `godkit/team-<id>`. A merge conflict is
  reported and that member's branch kept. Nothing lands in your branch: you review the team branch
  and `git merge` it.
- **Test, then review.** A FAIL or CHANGES goes back to an implementer with the report, at most
  `rounds` times (default 2). The run ends with PASS and APPROVE, or stops and says why.
- **Skills, automatically.** Each member preloads its role's skills in full. A goal about UI adds
  `godkit-frontend` to plan, code and review, and every project skill `godkit evolve` rates
  *trusted* is added to every member.
- **Your own team:** copy [`teams/default.md`](teams/default.md) to `.agent/team.md` and change the
  agents per role (any agent `godkit agent list` shows), add `<role>-skills`, `parallel` or `rounds`.

From an agent, over MCP: `godkit_team` starts a team and returns a job id; `godkit_jobs` collects it.
A leader that wants to run members itself starts them with `godkit_agent` and `background: true`,
several in a row, then waits for all of them with `godkit_jobs`. Background jobs are detached
processes with a status file in `~/.godkit/jobs/`, so the MCP server never blocks on a member.

### Eval

```bash
godkit eval --host claude,agy            # the same small tasks through each CLI
godkit eval --host claude,agy --godkit   # the same, with godkit initialised in each task repo
```

Each task in `evals/*.json` is a small repo, a prompt and a command that exits 0 only when the work
is right; every run gets a fresh git repo. It measures pass/fail and seconds, nothing else.
`--godkit` compares an agent with and without the protocol.

<br>

---

## Sprints

One seam is a task. Several seams pointed at one goal is a sprint.

```bash
godkit sprint new "ship auth"   # opens .agent/sprints/S-001.md
godkit sprint                   # what is in the current one, and whether it can close
godkit sprint close             # refuses while anything in it is unfinished or unproven
```

```
goal  ──►  wave 1 ──► join gate ──► wave 2 ──► join gate ──► wave 3 ──► close
           ├ T-001              ├ T-004
           ├ T-002              └ T-005
           └ T-003
           disjoint files       full suite after the merge
```

- **A wave is a set of tasks whose file scopes do not overlap.** A task that touches a file already
  claimed in this wave drops to the next one. "One owner per file", at wave level.
- **Every wave ends at a join gate:** one agent runs the full check suite after the merge. Each
  seam's exit condition proves the seam; the gate proves they still compose.
- `godkit sprint close` refuses while a task is unfinished, unwritten, or done with an empty `## Test`.

The CLI owns what a machine can decide: the file, the ids, the checks. Cutting the waves stays with
the model.

## Verify: is "done" actually done

```bash
godkit verify            # every task and log, against the rules the templates state
godkit verify --quiet    # the summary line only
```

```
T-007: no-verify - phase: done, ## Test empty. Run it and paste the real output.
T-011: resume-blocked - phase: blocked with no typed reason. Set blocked: needs-decision | ...
T-012: no-identity - owner is "claude" is a tool, not a model. Name the model: claude-opus-5, ...
log/2026-08-31T1402Z-claude-9f2a.md: resume-blocked - status: partial, ## Left / next empty.

tasks: 4 findings - all blocking.
```

A task needs a checkable `exit:`, a `done` claim needs the command and its real output, anything
short of done needs a handoff, every entry is signed with a model, and a `blocked` task says which
kind (`needs-decision`, `needs-evidence`, `external-wait`, `needs-owner`). Findings use
`godkit-review`'s tags, the command exits non-zero, and `godkit doctor` shows the count. The `Stop`
hook enforces one of these rules directly: a log saying `status: done` with an empty `## Verified`
does not clock out.

The check is **structural** on purpose: present, non-empty, not the template's placeholder. Judging
whether the evidence is any good is `godkit-review`'s job; a fuzzy check would misfire forever and
teach agents to write around it.

## The project map

`godkit-map` builds a graph of the codebase into `.agent/graph.json`, with a readable `MAP.md`.

```bash
godkit scan     # walk, categorize, resolve imports, group files that import each other into batches
godkit save     # normalize and write graph.json, MAP.md, meta.json
```

The judgment half is the model, through two subagents: `file-analyzer` reads one batch and emits
its nodes and edges, then `architect` derives the layers, the start-here tour and the description.
Both write one JSON each and never edit your code.

**Recall is grep, not load.** Node ids are `type:path[:name]`, so a concept and its neighbours cost
two greps and no context:

```bash
rg '"summary"' .agent/graph.json | rg -i token
rg 'function:src/auth/token.ts:isExpired' .agent/graph.json    # every caller
```

Refreshes are incremental: the map records the commit it was built at, and the classifier decides
how much to redo (`SKIP`, `PARTIAL`, `ARCHITECTURE`, `FULL`). The save path refuses to overwrite a
graph it could not read, so one bad parse cannot reset the project's memory.

## Refactor: evolving the code

Every session records which files it claimed, which it changed, and which one was to blame when
something broke. After a dozen sessions that is a churn-and-blame record nobody had to write.

```bash
godkit refactor          # top 15 code files by churn and blame
godkit refactor --all
```

```
  score  file                              touched  blamed  sessions  fan-in
  6      bin/godkit.js                     4        1       3         3
  6      hooks/install.js                  4        1       4         1
  4      lib/graph.js                      2        1       2         7
```

Score is `blamed × 2 + touched`; `fan-in` comes from the map. **It ranks attention, not badness:**
high blame with low fan-in is a fragile file worth fixing, high touch with no blame is usually just
the newest feature. The `godkit-refactor` skill is the judgment half.

## Project skills

The 16 shipped skills are the same everywhere. A project also builds up its own procedures (a
fixture reset, a release check), kept in `.agent/skills/<name>/SKILL.md`: committed, tool-neutral,
and linked into the paths Claude Code and Codex read.

```bash
godkit skills            # origin, safety findings, which agents see them
godkit skills --link     # into .claude/skills/ and .agents/skills/
godkit evolve            # what the logs say about each skill
godkit evolve --write    # project it to .agent/SKILLS.md
```

Every `SKILL.md` declares `origin` (`authored`, `captured`, `derived`, `fix`) and `enabled`. A
project skill is **inert until linked** and every revision lands in a diff; a scan also blocks one
that bundles an executable, carries a credential or tries to override the agent's instructions.
Generated skills do not link under the default `audit_only` mode until you set
`GODKIT_EVOLVE_MODE=autonomous` or pass `--force`, and `--force` never overrides a safety block.

| Trust level | Reached by |
|:--|:--|
| **trusted** | 3 successes across 3 distinct sessions, no failures |
| **provisional** | the default, and where a trusted skill lands after one failure |
| **quarantined** | 2 failures, a blocking safety finding, or `enabled: false`; never links |

The signal is the `skills:` field each log reports, so trust means *used repeatedly by sessions that
finished verified*: a correlation, not a quality measure. One failure demotes and three successes
promote, because a wrong instruction loaded into every session costs more than a slow promotion.

## The shipped skills

| Arriving and coordinating | Doing the work | Judging it afterwards |
|:--|:--|:--|
| `godkit` · arriving, sprints | `godkit-execute` · the pipeline, recovery | `godkit-review` · the process, failed runs |
| `godkit-handoff` · the `.agent/` protocol | `godkit-lazy` · fewest turns, least code | `godkit-triage` · GitHub issues and PRs |
| `godkit-plan` · seams, owners, task files | `godkit-refactor` · code that churns | `godkit-doubt` · test a decision first |
| `godkit-map` · the project map | `godkit-test` · what counts as verified | `godkit-evolve` · project skills |
| `godkit-git` · worktrees, merging `.agent/` | `godkit-output-enforcement` · no stubs | `godkit-help` · quick reference |
| | `godkit-frontend` · design taste, 11 variants | |

<details>
<summary><b>godkit-lazy: the two ladders, and the level</b></summary>

<br>

**Fewest turns.** Is the answer already in the map or the board? Can a command answer it? Read once,
wide. Edit, do not rewrite. Verify once, at the end.

**Least code.** Does it need to exist? Is it already in this repo? The standard library? A native
platform feature? An installed dependency? One line? Only then, the minimum that works.

Where the hooks are installed it is on every session, at a level resolved from `GODKIT_LAZY_MODE`,
then `defaultMode` in `~/.config/godkit/config.json` (`%APPDATA%\godkit\config.json` on Windows),
then `full`.

```
/godkit-lazy [lite|full|ultra|off]           this session
/godkit-lazy default [lite|full|ultra|off]   the default for new sessions
```

It is injected into subagents too; `GODKIT_LAZY_SUBAGENT_MATCHER` (a regex on the subagent type)
narrows which ones.

</details>

<br>

---

## CLI reference

| Command | Does |
|:--|:--|
| `godkit init [path] [--new] [--no-install]` | set up the project (and the machine, the first time); detects a new project by itself |
| `godkit doctor` | what is set up, whether the map is stale, Codex approval, last seen per agent |
| `godkit recall <file\|words>` | search all history: logs, board, thread, tasks, archive |
| `godkit verify [--quiet]` | is every "done" backed by evidence? non-zero if not |
| `godkit sprint [new "<goal>" \| close]` | a goal and its waves of file-disjoint tasks |
| `godkit scan` · `godkit save` | build the project map |
| `godkit skills [--link\|--unlink]` | this project's own skills |
| `godkit evolve [--write]` | what the logs say about each project skill |
| `godkit refactor [--all]` | which code files churn and get blamed most |
| `godkit hooks [status\|install\|uninstall]` | hook registrations for all four agents; `--dry-run` |
| `godkit mcp [install\|uninstall]` | the MCP server; no argument runs it on stdio; `--codex-approve` |
| `godkit githook [install\|uninstall]` | the pre-commit hook |
| `godkit autoinit [on\|off]` | set a project up at its first agent session |
| `godkit agents [sync\|clean\|status]` | subagent files for Claude and Codex |
| `godkit team [show \| run "<goal>"] [--background]` | a team of agents: plan, code in parallel, test, review |
| `godkit agent [list \| run <name> "<task>" \| model] [--background]` | run a named subagent as its own process |
| `godkit agent jobs` · `godkit agent wait <id...>` | members and teams started in the background |
| `godkit delegate <host> "<task>" [--write]` | hand a task to another agent CLI, read-only by default |
| `godkit rewind [session/n] [--yes]` | go back to a checkpoint taken before an edit |
| `godkit eval --host a,b [--godkit]` | run small tasks through agent CLIs and compare |
| `godkit install [tool...]` | the skills into your home folder, for every project |
| `godkit uninstall [tool\|--project]` | remove what godkit placed; never touches `.agent/` |
| `godkit --version` | the installed version |

### Environment variables

| Variable | Effect |
|:--|:--|
| `GODKIT_GUARD=off` | turn the guard off |
| `GODKIT_CHECKPOINT=off` | turn checkpoints off |
| `GODKIT_CHECKPOINT_DEBOUNCE` | minimum time between checkpoints (default 15 s) |
| `GODKIT_STRICT=1` | the pre-commit hook blocks instead of warning |
| `GODKIT_AUTO_INIT` | same as `godkit autoinit`, for one run |
| `GODKIT_CODEX_APPROVE=1\|0` | override the Codex tool-approval setting |
| `GODKIT_<HOST>_MODEL` | model for delegated and subagent runs, e.g. `GODKIT_CODEX_MODEL` |
| `GODKIT_AGENT_MAX_DEPTH` / `GODKIT_AGENT_MAX_CONCURRENT` | subagent nesting and concurrency limits (3 / 20) |
| `GODKIT_LAZY_MODE` | `lite`, `full`, `ultra` or `off` |
| `GODKIT_LAZY_SUBAGENT_MATCHER` | which subagent types get the lazy rules |
| `GODKIT_EVOLVE_MODE=autonomous` | let generated project skills link |
| `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `CURSOR_HOME`, `GEMINI_HOME` | where each agent's config lives |

## Troubleshooting

| Symptom | Cause and fix |
|:--|:--|
| Codex never shows the brief, edits are not tracked | Codex has not approved the hooks. Open `/hooks` in Codex (or "Review hooks" in the app) and approve godkit's. Again after each upgrade. `godkit doctor` says when it is pending. |
| Codex asks before every godkit tool call | Expected by default. `godkit mcp install --codex-approve` lets godkit's own tools through. |
| A Codex subagent fails: "model not supported" | Your Codex default model is one your account rejects. `godkit agent model codex <model>` or `GODKIT_CODEX_MODEL`. |
| Antigravity: every hook fails, even other tools' | On Windows, a hook command with double quotes around its path fails. Remove the quotes from that command in `~/.gemini/config/hooks.json`; a path without spaces does not need them. |
| `agy` delegation returns `AGY_ERROR` with a 503 | The model is out of capacity for a while. Retry, or name another with `GODKIT_AGY_MODEL`. |
| `agy` delegation: "jetski: no output produced" | A tool wanted a permission headless mode cannot ask for. Godkit does not pass `--dangerously-skip-permissions`; allow the command in Antigravity's settings, or delegate read-only. |
| A hook seems to do nothing | Hooks fail open by design. `godkit doctor` shows what is registered and when each agent last ran it. |

<br>

---

## Design

| | |
|:--|:--|
| **Zero runtime dependencies** | Node's standard library only, in the package, the hooks, the MCP server and the tests. |
| **One source of truth per fact** | `AGENTS.md` generates every rule file; `hooks/godkit-hooks.json` every hook registration; `graph.json` the map and its freshness. |
| **Enforce with the strongest tool the agent has** | Hooks where they exist, MCP everywhere, git and CI underneath. Instructions are the floor, not the plan. |
| **Hooks never throw** | A broken hook must not break the session it was meant to help. |
| **Derive, do not duplicate** | Skill trust and refactor scores come from the log stream, not a second store that could go stale. |
| **Nothing absolute is committed** | Paths in the graph are relative to the project root; no machine layout or username ships in your repo. |
| **Shortcuts are marked** | A `godkit:` comment names the ceiling and the upgrade path. |

## Development

```bash
npm test                            # node --test, no framework
node scripts/sync-rules.js          # regenerate the rule copies from AGENTS.md
node scripts/sync-rules.js --check  # fail if any drifted (CI runs it)
node scripts/sync-hooks.js          # regenerate hook registrations from hooks/godkit-hooks.json
node scripts/check-versions.js      # all manifests agree on the version
```

`npm test` runs the sync and version checks first. CI runs on `{ubuntu, windows} × {node 18, 22, 24}`.
The landing page is in [`site/`](site/README.md).

Contributions follow the protocol the tool describes: read `.agent/BOARD.md`, claim your scope,
leave a log. A new skill is `skills/<name>/SKILL.md` with frontmatter and a `## Boundaries` section,
plus a matching `commands/<name>.toml`; the contract tests enforce both.

<br>

---

<div align="center">

MIT © [CodeForFee](https://github.com/CodeForFee)

<sub>Read <code>.agent/</code> before you edit. Write your log before you finish.</sub>

</div>
