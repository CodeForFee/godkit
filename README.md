<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/CodeForFee/godkit/main/assets/logo-dark.svg">
  <img src="https://raw.githubusercontent.com/CodeForFee/godkit/main/assets/logo.svg" alt="Godkit" width="104" height="104">
</picture>

# Godkit

### One shared harness for every AI agent

Claude Code, Cursor, Codex and Antigravity all point at the same repo.<br>
Give them the same memory, the same board, and the same rules.

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

**[Why](#why)** · **[How it works](#how-it-works)** · **[Install](#install)** · **[Sprints](#sprints)** · **[CLI](#cli)** · **[Skills](#skills)** · **[The map](#the-project-map)** · **[Verify](#verify--is-done-actually-done)**

</div>

<br>

---

## Why

Every agent arrives blind. It does not know what the project is, what was already done, which file someone else is holding, or what was decided last week. So work gets redone, two agents edit the same file, and every session starts by re-reading the codebase from scratch.

Private memory does not fix this — Cursor cannot read Claude's memory directory, and Claude cannot read Cursor's:

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

> **The only shared memory between tools is the filesystem they both open.**

## How it works

Godkit puts one committed directory in your repo, and teaches every agent to use it.

```
.agent/
├── BOARD.md               roster · claims · task index · bugs · decisions — one screen
├── THREAD.md              append-only conversation between agents
├── BRIEF.md               what this project is, before there is code to map
├── MAP.md                 what this codebase is (generated)
├── graph.json             the machine-readable map
├── SKILLS.md              this project's own skills (generated)
├── skills/<name>/         procedures this project repeats, linked into host paths
├── sprints/S-001-*.md     a goal, and the waves of tasks under it
├── tasks/T-001-*.md       one per task: Plan · Execute · Review · Test · Handoff
└── log/<UTC>-<model>.md   one per session, append-only, never edited by others
```

Two rules, enforced everywhere:

> ### Read `.agent/` before you edit. Write your log before you finish.

An agent arriving at a project reads the board and the map, claims a scope, writes its tasks out as files, and leaves a log the next agent can resume from. Overlapping claims stop it before it edits. On Claude Code, a `Stop` hook blocks the turn until the log exists.

Append-only everywhere is deliberate: **one log file per session** means two tools writing at the same moment never conflict, and git merges them without a thought. The generated half (`graph.json`, `meta.json`, `MAP.md`) is marked `-merge` in `.gitattributes` instead — a textual merge there would inject conflict markers into JSON and leave the map unparseable, so those are resolved by regenerating, never by hand.

<br>

---

## Install

<table>
<tr>
<td width="50%" valign="top">

**An existing project**

```bash
npx @codeforfee/godkit init
```

Scaffolds `.agent/` and the per-tool rule files, and — the first time on this machine only — places the skills and registers the hooks.

</td>
<td width="50%" valign="top">

**A project with no code yet**

```bash
npx @codeforfee/godkit init --new
```

No map is built, because there is nothing to map. You get `.agent/BRIEF.md` instead, and the first sprint is cut from it.

</td>
</tr>
</table>

A machine that is already set up is left alone, so running `init` in your next repo touches nothing outside it. `--no-install` does the project half only.

<details>
<summary><b>Doing the machine half yourself, or scripting it</b></summary>

<br>

```bash
npm install -g @codeforfee/godkit

godkit install            # place the skills once per machine
godkit hooks install      # register the hooks (claude, codex)
godkit init --no-install  # project only, nothing outside it
godkit doctor             # what is set up, and whether the map is stale
```

On Claude Code you can take the skills and hooks as a plugin instead, and skip `godkit install` entirely:

```
/plugin marketplace add CodeForFee/godkit
/plugin install godkit@godkit
```

You still run `godkit init` per project — the plugin carries the skills and hooks, not your repo's `.agent/`.

</details>

Both sides only ever touch what they created. `install` refuses a destination it does not own — a skill directory you wrote by hand is never replaced — and `uninstall` leaves it alone and says so. Add `--dry-run` to either to see what would happen first.

In a project, `init` writes into a marked block:

```
<!-- godkit:start -->
...the rules...
<!-- godkit:end -->
```

Everything outside those markers is yours and is never touched, so an existing `CLAUDE.md` keeps whatever you had in it. If the markers have been hand-edited into something ambiguous, `init` refuses that file and tells you, rather than guessing. `init` also adds the `-merge` lines for the generated map files to your `.gitattributes`.

### Compatibility

| Tool | Skills | Always-on rules | Hooks |
|:--|:--|:--|:--:|
| **Claude Code** | `~/.claude/skills/` | `CLAUDE.md` | ✅ |
| **Codex** | `~/.agents/skills/` | `AGENTS.md` | ✅ |
| **Cursor** | — | `.cursor/rules/godkit.mdc` | — |
| **Antigravity** | `~/.gemini/antigravity/skills/godkit` | `.agents/rules/godkit.md` | — |

Where a tool has no hook support, the always-on rule file *is* the enforcement. That is why they all say the same thing. On Claude Code the protocol is **enforced**; everywhere else it is **instructed**, and the shared `.agent/` state is what makes that difference survivable.

[`docs/agent-portability.md`](docs/agent-portability.md) has the per-tool detail: exact paths, what each host reads, and what it ignores.

<details>
<summary><b>Hooks — what each one does, and why none of them can break your session</b></summary>

<br>

```bash
godkit hooks status       # how many are registered, and where
godkit hooks install      # into ~/.claude/settings.json and ~/.codex/settings.json
godkit hooks uninstall
godkit hooks install --dry-run
```

(`$CLAUDE_CONFIG_DIR` and `$CODEX_HOME` are honoured if set.)

| Hook | Event | Does |
|:--|:--|:--|
| `brief.js` | `SessionStart` | injects the board, map freshness, newest log entries, and this project's skills |
| `lazy-activate.js` | `SessionStart` | resolves the active `godkit-lazy` mode and injects its ruleset |
| `lazy-subagent.js` | `SubagentStart` | injects the same ruleset into spawned subagents |
| `lazy-mode-tracker.js` | `UserPromptSubmit` | tracks `/godkit-lazy` mode switches for the session |
| `work-track.js` | `PreToolUse`, `PostToolUse`, `SessionEnd` | records whether *this* session changed project files |
| `clockout.js` | `Stop` | blocks the turn if this session changed files and wrote no log |
| `map-watch.js` | `PostToolUse` (Bash) | after a commit or merge, says if the map went stale |

Re-running is safe: it drops its own previous entries first and writes a `.bak`. Other tools' hooks are left alone — including one that shares a group with ours, because entries are matched one handler at a time, not one group at a time. The write is a temp-and-rename compared against the bytes it read, so a settings file edited underneath it is never silently clobbered, and a file that already says exactly the right thing is not rewritten at all. If it cannot parse your settings file it changes nothing and says so.

`clockout.js` judges the session, not the directory: a dirty file someone else left behind is not evidence about you, and a log naming a different session does not clock you out. That is what `work-track.js` is for — without it registered, clockout has nothing to act on.

**Hooks never throw.** Malformed input, missing git, absent `.agent/` — all exit 0. A broken hook must not break the session it was meant to help.

</details>

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

**A wave is a set of tasks whose file scopes do not overlap.** That is the entire admission rule. A task touching a file already claimed in this wave drops to the next one — it does not run in parallel and get merged hopefully. It is "one owner per file", stated at wave level.

**Every wave ends at a join gate:** one agent runs the full check suite after the merge. Without it you do not have a wave, you have several edits that happened to overlap in time. Each seam's own exit condition proves the seam; the gate proves they still compose.

`godkit sprint close` refuses while any task the sprint names is unfinished, unwritten, or finished with an empty `## Test`. It is the same contract `godkit verify` applies, scoped to one goal.

The CLI owns only what a machine can decide — creating the file, resolving the ids, checking the tasks. **Cutting the waves stays with the model**, the same split `scan`/`save` has with the map.

## Identity — a model, never a tool

Every claim, task and log is signed with the **model** that made it:

```yaml
agent: "claude-opus-5"     # not "claude"
owner: codex-5.6-terra     # not "codex"
```

One tool runs many models, with different costs, context windows and failure modes. An agent reading someone else's unproven claim needs to know which one made it — and `claude` cannot answer that. `godkit verify` rejects a bare tool name.

It is enforced by **shape**, not by a shipped list of known model ids: an allowlist goes stale within a quarter and then starts rejecting the truth. Entries written before the rule say `unrecorded`, because back-filling a guess would put a fabricated attribution into a permanent record.

<br>

---

## CLI

| Command | Does |
|:--|:--|
| `godkit init [path] [--new] [--no-install]` | scaffold `.agent/` and the rule files; `--new` for a project with no code |
| `godkit install [tool...]` | install the skills for claude, codex, antigravity (default: all) |
| `godkit sprint [new "goal" \| close]` | a goal and its waves of file-disjoint tasks |
| `godkit scan [path]` | walk the project and group it into batches for the map |
| `godkit save [file]` | save a merged graph as the map (`graph.json`, `MAP.md`, `meta.json`) |
| `godkit skills [--link\|--unlink] [tool...]` | this project's own skills in `.agent/skills/` |
| `godkit evolve [--write]` | what the logs say about each project skill; `--write` → `.agent/SKILLS.md` |
| `godkit refactor [--all]` | what the logs say about each code file: churn, blame, fan-in |
| `godkit hooks [status\|install\|uninstall]` | the hook registrations, with `--dry-run` |
| `godkit verify [--quiet]` | tasks and logs against the rules the templates state; non-zero on findings |
| `godkit doctor` | what is set up here, whether the map is stale, which hooks are registered |
| `godkit uninstall [tool]` | remove the skills godkit installed (leaves your `.agent/` alone) |
| `godkit --version` | the installed version |

## Skills

Sixteen skills ship with godkit and are the same in every project.

<table>
<tr><th align="left" width="34%">Arriving and coordinating</th><th align="left">Use for</th></tr>
<tr><td><code>godkit</code></td><td>arriving at a project, synthesizing the work, running a sprint</td></tr>
<tr><td><code>godkit-handoff</code></td><td>the <code>.agent/</code> protocol and its file formats</td></tr>
<tr><td><code>godkit-plan</code></td><td>cutting seams, assigning owners, writing task files</td></tr>
<tr><td><code>godkit-map</code></td><td>building or refreshing the project map</td></tr>
<tr><td><code>godkit-git</code></td><td>worktrees, commit-as-checkpoint, merging <code>.agent/</code></td></tr>
</table>

<table>
<tr><th align="left" width="34%">Doing the work</th><th align="left">Use for</th></tr>
<tr><td><code>godkit-execute</code></td><td>running work through the pipeline, error recovery</td></tr>
<tr><td><code>godkit-lazy</code></td><td>fewest turns to the smallest change that works</td></tr>
<tr><td><code>godkit-refactor</code></td><td>evolving the source, from what the logs say is churned and blamed</td></tr>
<tr><td><code>godkit-test</code></td><td>what counts as verified, and writing the check</td></tr>
<tr><td><code>godkit-output-enforcement</code></td><td>catching stubbed or truncated generated output</td></tr>
<tr><td><code>godkit-frontend</code></td><td>design taste — dials, banned defaults, 11 style variants</td></tr>
</table>

<table>
<tr><th align="left" width="34%">Judging it afterwards</th><th align="left">Use for</th></tr>
<tr><td><code>godkit-review</code></td><td>reviewing the process, or diagnosing a failed run</td></tr>
<tr><td><code>godkit-triage</code></td><td>GitHub issues and PRs: fresh-base diffs, the posting gate, batches</td></tr>
<tr><td><code>godkit-doubt</code></td><td>pressure-testing a decision before it binds everyone</td></tr>
<tr><td><code>godkit-evolve</code></td><td>capturing, deriving and fixing this project's own skills</td></tr>
<tr><td><code>godkit-help</code></td><td>quick reference card</td></tr>
</table>

<details>
<summary><b>godkit-lazy — the two ladders, and how to change the level</b></summary>

<br>

`godkit-lazy` optimises two things most guidance ignores one of: the code you write, and the turns you take getting there.

**Ladder one — fewest turns.** Is the answer already in the map or the board? Can a command answer it? Read once, wide. Edit, do not rewrite. Verify once, at the end.

**Ladder two — least code.** Does it need to exist? Already in this repo? Stdlib? A native platform feature? An installed dependency? One line? Only then, the minimum that works.

Where the hooks are installed it runs every session automatically, at a level resolved in this order: the `GODKIT_LAZY_MODE` env var, then `defaultMode` in `~/.config/godkit/config.json` (`%APPDATA%\godkit\config.json` on Windows), then `full`.

```
/godkit-lazy [lite|full|ultra|off]           switch for this session (no argument reports the level)
/godkit-lazy default [lite|full|ultra|off]   persist the default for new sessions
```

It injects into every subagent spawned via the Agent tool too — scope that with `GODKIT_LAZY_SUBAGENT_MATCHER`, a regex tested against the subagent's type, if some agent types should skip it.

</details>

<br>

---

## Project skills

The sixteen skills above are the same everywhere. A *project* also accumulates its own procedures — a fixture reset, a release check, a migration dance. Those live in `.agent/skills/<name>/SKILL.md`: committed, tool-neutral, and linked into the paths Claude Code and Codex actually read.

```bash
godkit skills            # origin, safety findings, which hosts see them
godkit skills --link     # link into .claude/skills/ and .agents/skills/
godkit skills --unlink
```

Write one with the `godkit-evolve` skill, or by hand. Every SKILL.md must declare `origin` (`authored`, `captured`, `derived` or `fix`) and `enabled` (`true` or `false`) in its frontmatter; one that does not, or whose frontmatter will not parse, is a blocking finding and does not link.

What godkit links is an owned **snapshot**, not a live link: the copy carries a digest of the source it was taken from, so godkit replaces only what it wrote and never removes something you put at that path yourself.

**Two things keep a generated skill from being dangerous, and the pattern scan is neither of them.** It is **inert until linked** — no host reads `.agent/skills/` — and `.agent/` is **committed**, so every skill and every revision lands in a diff. On top of those, a scan blocks linking a skill that bundles an executable, carries a credential, or tries to override the agent's instructions.

Generated skills (`origin: captured` or `derived`) will not link at all under the default `audit_only` mode. They sit in the repo as reviewable, inert markdown until you set `GODKIT_EVOLVE_MODE=autonomous` or pass `--force`. **`--force` overrides the mode; it never overrides a safety block.**

<details>
<summary><b>Evidence — what "trusted" actually means, and why it is a correlation</b></summary>

<br>

`godkit evolve` re-reads `.agent/log/*.md` and says what the evidence implies about each skill.

```bash
godkit evolve            # the report
godkit evolve --write    # project it to .agent/SKILLS.md
```

There is no separate store. A log entry lists the skills it used in its `skills:` frontmatter, and that plus `status:` and the `## Verified` and `## Bugs` sections is the whole signal. Edit a skill and bump `revised:`, and its evidence window resets — you are judging the text that exists now, not what its ancestor did.

| Level | Reached by |
|:--|:--|
| **trusted** | 3 successes across 3 *distinct* sessions, no failures |
| **provisional** | the default, and where a trusted skill lands after one attributable failure |
| **quarantined** | 2 failures, a blocking safety finding, or `enabled: false` — will not link, even with `--force` |

> **Precisely: *used repeatedly, and the sessions that used it finished verified*.**

Godkit does not run your agent, so it cannot observe a skill being used. The `skills:` field is a self-report by the same agent that just used it, and self-reports skew positive. This is a usage/outcome **correlation, not a quality measure**, and a trusted skill can still be wrong. `godkit evolve` prints how many log entries it could not attribute at all, on every run, for exactly this reason.

Demotion is deliberately asymmetric — three sessions to promote, one failure to demote — because a wrong instruction auto-loaded into an agent's context costs more than a slow promotion. And a session that ends `blocked` with three skills listed blames none of them: attribution that guesses would demote good skills.

</details>

<br>

---

## The project map

`godkit-map` builds a graph of the codebase into `.agent/graph.json`, with a readable `.agent/MAP.md` projection. The deterministic half is a script — walk, categorize, resolve imports, group files that import each other into the same batch:

```bash
godkit scan     # walk, categorize, resolve imports, batch
godkit save     # normalize, write graph.json + MAP.md + meta.json
```

The judgment half is the model, through two agent prompts the package ships in `agents/`: `file-analyzer` reads one batch and emits the nodes and edges for it, then `architect` reads the merged graph and derives the layers, the start-here tour and the project description. Both read files and write one JSON each — neither edits your code.

**Recall is grep, not load.** Node ids are `type:path[:name]`, so finding a concept and then its one-hop neighbourhood costs two greps and no context:

```bash
rg '"summary"' .agent/graph.json | rg -i token
rg 'function:src/auth/token.ts:isExpired' .agent/graph.json    # every caller
```

Refreshes are incremental. The map records the commit it was built at; the classifier decides how much to redo — `SKIP`, `PARTIAL`, `ARCHITECTURE` or `FULL` — so a two-file change never triggers a full rebuild.

A file's structural signature is derived from the graph itself rather than a second store, which means the two can never disagree. The save path also refuses to overwrite a graph it could not read, so one bad parse cannot quietly reset your project's memory.

## Refactor — evolving the code

Every session already records which files it claimed, which it changed, and which one was actually to blame when something broke. After a dozen sessions that is a churn-and-blame record nobody had to author.

```bash
godkit refactor          # top 15 code files by churn and blame
godkit refactor --all    # the whole ranking
```

```
  score  file                              touched  blamed  sessions  fan-in
  6      bin/godkit.js                     4        1       3         3
  6      hooks/install.js                  4        1       4         1
  4      lib/graph.js                      2        1       2         7
```

`touched` is sessions whose `scope:` or `## Did` named the file, `blamed` is `## Bugs` bullets that named it as a **root cause**, and `fan-in` comes from the map — who breaks if this file is wrong. Score is `blamed × 2 + touched`: a root cause is evidence about the code, while a touch is often evidence about what someone happened to be working on that week.

**It ranks attention, not badness**, and the four columns say different things — high blame with low fan-in is a fragile file worth fixing, while high touch with zero blame is usually just the newest feature. Reading the code is not optional, and "nothing is wrong with the top file" is an expected result. The `godkit-refactor` skill is the judgment half; the same split as the map.

Note the division of labour with `godkit evolve`: both read the same log stream, but **evolve evolves procedures** into `.agent/skills/`, and **refactor evolves the source code**.

## Verify — is "done" actually done

The task and log templates state the rules: a task needs a checkable `exit:`, a `done` claim needs the command and its real output, anything short of done needs a handoff, and every entry is signed with the model that wrote it. Nothing read those files back, so an agent could mark a task done, write a log, clock out clean, and have proven nothing. The next agent then inherits a claim instead of a result.

```bash
godkit verify            # every task and log, against those rules
godkit verify --quiet    # the summary line only
```

```
T-007: no-verify - phase: done, ## Test empty. Run it and paste the real output.
T-011: resume-blocked - phase: blocked with no typed reason. Set blocked: needs-decision | ...
T-012: no-identity - owner is "claude" is a tool, not a model. Name the model: claude-opus-5, ...
log/2026-08-31T1402Z-claude-9f2a.md: resume-blocked - status: partial, ## Left / next empty.

tasks: 4 findings - all blocking.
```

Findings use `godkit-review`'s own tags — `no-exit`, `no-verify`, `no-identity`, `resume-blocked` — so a verify finding and a review finding read the same. It exits non-zero, so CI and hooks can stop on it, and `godkit doctor` shows the count. The Stop hook enforces exactly one of these rules: a log claiming `status: done` with an empty `## Verified` does not clock out.

A `blocked` task also has to say **which kind** of blocked — `needs-decision`, `needs-evidence`, `external-wait`, or `needs-owner` — because "blocked" alone tells the next agent that work stopped but not whether they can do anything about it.

The check is deliberately **structural**: present, non-empty, not the template's own placeholder comment. It cannot tell whether your evidence is any good, and it does not try — a fuzzy check would misfire forever and teach agents to write around it. Judging the evidence is `godkit-review`'s job.

<br>

---

## Design

| | |
|:--|:--|
| **Zero runtime dependencies** | Node standard library only, in the package and in the tests. No install step, nothing to audit, nothing to break. |
| **One source of truth per fact** | `AGENTS.md` generates every rule file. `graph.json` generates `MAP.md` and its own freshness signatures. A generated file cannot be edited in the wrong place. |
| **Derive, do not duplicate** | Skill trust comes from the log stream rather than a second store, because a stale record would actively mislead the next agent. |
| **Hooks never throw** | Malformed input, missing git, absent `.agent/` — all exit 0. |
| **Nothing absolute is committed** | Paths in the graph are sanitized to the project root, so no machine layout or username ships in your repo. |
| **Shortcuts are marked** | A `godkit:` comment names the ceiling and the upgrade path. An unmarked shortcut is indistinguishable from a mistake. |

## Development

```bash
npm test                            # node --test, no framework
node scripts/sync-rules.js          # regenerate the rule copies from AGENTS.md
node scripts/sync-rules.js --check  # fail if any drifted (runs in CI)
node scripts/check-versions.js      # all four manifests agree on the version
```

`npm test` runs `pretest` first, so the rule-sync and version checks gate the suite. CI runs the same three steps across `{ubuntu, windows} × {node 18, 22, 24}`.

Contributions follow the protocol the tool describes: read `.agent/BOARD.md`, claim your scope, and leave a log entry. Adding a skill means a `skills/<name>/SKILL.md` with frontmatter and a `## Boundaries` section, plus a matching `commands/<name>.toml` — the contract tests enforce both.

<br>

---

<div align="center">

MIT © [CodeForFee](https://github.com/CodeForFee)

<sub>Read <code>.agent/</code> before you edit. Write your log before you finish.</sub>

</div>
