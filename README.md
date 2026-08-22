<div align="center">

# Godkit

**One shared harness for every AI agent.**

Claude Code, Cursor, Codex and Antigravity all point at the same repo.<br>
Give them the same memory, the same board, and the same rules.

[![CI](https://github.com/CodeForFee/godkit/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/CodeForFee/godkit/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

```bash
npx godkit init
```

</div>

---

## Contents

| | |
|---|---|
| **[Why](#why)** · [How it works](#how-it-works) | the problem, and the shape of the answer |
| **[Install](#install)** · [Hooks](#hooks) · [Compatibility](#compatibility) | getting it running |
| **[CLI](#cli)** · [Skills](#skills) | the reference |
| **[Project skills](#project-skills)** · [Evidence](#evidence) | skills a project keeps for itself |
| **[The project map](#the-project-map)** | the codebase graph |
| **[Design](#design)** · [Development](#development) · [License](#license) | how it is built |

## Why

Every agent arrives blind. It does not know what the project is, what was already done, which file someone else is holding, or what was decided last week. So work gets redone, two agents edit the same file, and every session starts by re-reading the codebase from scratch.

Private memory does not fix this: Cursor cannot read Claude's memory directory, and Claude cannot read Cursor's.

> **The only shared memory between tools is the filesystem they both open.**

## How it works

Godkit puts one committed directory in your repo, and teaches every agent to use it.

```
.agent/
├── BOARD.md              roster · claims · task index · bugs · decisions — one screen
├── THREAD.md             append-only conversation between agents
├── MAP.md                what this codebase is (generated)
├── graph.json            the machine-readable map
├── SKILLS.md             this project's own skills (generated)
├── skills/<name>/        procedures this project repeats, linked into host paths
├── tasks/T-001-*.md      one per task: Plan · Execute · Review · Test · Handoff
└── log/<UTC>-<agent>.md  one per session, append-only, never edited by others
```

Two rules, enforced everywhere:

> **Read `.agent/` before you edit. Write your log before you finish.**

An agent arriving at a project reads the board and the map, claims a scope, writes its tasks out as files, and leaves a log the next agent can resume from. Overlapping claims stop it before it edits. On Claude Code, a `Stop` hook blocks the turn until the log exists.

Append-only everywhere is deliberate: **one log file per session** means two tools writing at the same moment never conflict, and git merges them without a thought. The generated half (`graph.json`, `meta.json`, `MAP.md`) is marked `-merge` in `.gitattributes` instead — a textual merge there would inject conflict markers into JSON and leave the map unparseable, so those are resolved by regenerating, never by hand.

## Install

```bash
npm install -g godkit

godkit install       # place the skills once per machine
godkit hooks install # register the hooks (claude, codex)
godkit init          # scaffold .agent/ + rule files into the current repo
godkit doctor        # what is set up, and whether the map is stale
```

`godkit install` places the skills once per machine; `godkit init` writes the rule files once per project. Every rule file is generated from a single `AGENTS.md`, so they cannot drift apart — CI byte-compares them.

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
|---|---|---|---|
| **Claude Code** | `~/.claude/skills/` | `CLAUDE.md` | yes |
| **Codex** | `~/.agents/skills/` | `AGENTS.md` | yes |
| **Cursor** | — | `.cursor/rules/godkit.mdc` | not supported |
| **Antigravity** | `~/.gemini/antigravity/skills/godkit` | `.agents/rules/godkit.md` | not supported |

Where a tool has no hook support, the always-on rule file *is* the enforcement. That is why they all say the same thing. On Claude Code the protocol is **enforced**; everywhere else it is **instructed**, and the shared `.agent/` state is what makes that difference survivable.

### Hooks

```bash
godkit hooks status       # how many are registered, and where
godkit hooks install      # into ~/.claude/settings.json and ~/.codex/settings.json
godkit hooks uninstall
godkit hooks install --dry-run
```

(`$CLAUDE_CONFIG_DIR` and `$CODEX_HOME` are honoured if set.)

Re-running is safe: it drops its own previous entries first and writes a `.bak`. Other tools' hooks are left alone — including one that shares a group with ours, because entries are matched one handler at a time, not one group at a time. The write is a temp-and-rename compared against the bytes it read, so a settings file edited underneath it is never silently clobbered. If it cannot parse your settings file it changes nothing and says so.

| Hook | Event | Does |
|---|---|---|
| `brief.js` | `SessionStart` | injects the board, map freshness, newest log entries, and this project's skills |
| `lazy-activate.js` | `SessionStart` | resolves the active `godkit-lazy` mode and injects its ruleset |
| `lazy-subagent.js` | `SubagentStart` | injects the same ruleset into spawned subagents |
| `lazy-mode-tracker.js` | `UserPromptSubmit` | tracks `/godkit-lazy` mode switches for the session |
| `work-track.js` | `PreToolUse`, `PostToolUse`, `SessionEnd` | records whether *this* session changed project files |
| `clockout.js` | `Stop` | blocks the turn if this session changed files and wrote no log |
| `map-watch.js` | `PostToolUse` (Bash) | after a commit or merge, says if the map went stale |

`clockout.js` judges the session, not the directory: a dirty file someone else left behind is not evidence about you, and a log naming a different session does not clock you out. That is what `work-track.js` is for — without it registered, clockout has nothing to act on.

Hooks never throw. Malformed input, missing git, absent `.agent/` — all exit 0. A broken hook must not break the session it was meant to help.

## CLI

| Command | Does |
|---|---|
| `godkit init [path]` | scaffold `.agent/` and the per-tool rule files into a project |
| `godkit install [tool...]` | install the skills for claude, codex, antigravity (default: all) |
| `godkit scan [path]` | walk the project and group it into batches for the map |
| `godkit save [file]` | save a merged graph as the map (`graph.json`, `MAP.md`, `meta.json`) |
| `godkit skills [--link\|--unlink] [tool...] [--force]` | this project's own skills in `.agent/skills/` |
| `godkit evolve [--write]` | what the logs say about each project skill; `--write` → `.agent/SKILLS.md` |
| `godkit hooks [status\|install\|uninstall]` | the hook registrations, with `--dry-run` |
| `godkit doctor` | what is set up here, whether the map is stale, and which hooks are registered |
| `godkit uninstall [tool]` | remove the skills godkit installed (leaves your `.agent/` alone) |

## Skills

Fourteen skills ship with godkit and are the same in every project.

**Arriving and coordinating**

| Skill | Use for |
|---|---|
| `godkit` | arriving at a project, synthesizing and splitting the work |
| `godkit-handoff` | the `.agent/` protocol and its file formats |
| `godkit-plan` | cutting seams, assigning owners, writing task files |
| `godkit-map` | building or refreshing the project map |
| `godkit-git` | worktrees, commit-as-checkpoint, merging `.agent/` |

**Doing the work**

| Skill | Use for |
|---|---|
| `godkit-execute` | running work through the pipeline, error recovery |
| `godkit-lazy` | what to build and what to skip |
| `godkit-test` | what counts as verified, writing the check |
| `godkit-output-enforcement` | catching stubbed or truncated generated output |
| `godkit-frontend` | design taste — dials, banned defaults, 11 style/workflow variants |

**Judging it afterwards**

| Skill | Use for |
|---|---|
| `godkit-review` | reviewing the process, or diagnosing a failed run |
| `godkit-doubt` | pressure-testing a decision before it binds everyone |
| `godkit-evolve` | capturing, deriving and fixing this project's own skills |
| `godkit-help` | quick reference card |

### godkit-lazy modes

Where the hooks are installed, `godkit-lazy` runs every session automatically, at a level resolved in this order: the `GODKIT_LAZY_MODE` env var, then `defaultMode` in `~/.config/godkit/config.json` (`%APPDATA%\godkit\config.json` on Windows), then `full`.

```
/godkit-lazy [lite|full|ultra|off]           switch for this session (no argument reports the level)
/godkit-lazy default [lite|full|ultra|off]   persist the default for new sessions
```

It injects into every subagent spawned via the Agent tool too — scope that with `GODKIT_LAZY_SUBAGENT_MATCHER`, a regex tested against the subagent's type, if some agent types should skip it.

## Project skills

The fourteen skills above are the same everywhere. A *project* also accumulates its own procedures — a fixture reset, a release check, a migration dance. Those live in `.agent/skills/<name>/SKILL.md`: committed, tool-neutral, and linked into the paths Claude Code and Codex actually read.

```bash
godkit skills            # origin, safety findings, which hosts see them
godkit skills --link     # link into .claude/skills/ and .agents/skills/
godkit skills --unlink
```

Write one with the `godkit-evolve` skill, or by hand. Every SKILL.md must declare `origin`
(`authored`, `captured`, `derived` or `fix`) and `enabled` (`true` or `false`) in its frontmatter;
one that does not, or whose frontmatter will not parse, is a blocking finding and does not link.

What godkit links is an owned **snapshot**, not a live link: the copy carries a digest of the
source it was taken from, so godkit replaces only what it wrote and never removes something you
put at that path yourself.

**Two things keep a generated skill from being dangerous, and the pattern scan is neither of them.** It is **inert until linked** — no host reads `.agent/skills/` — and `.agent/` is **committed**, so every skill and every revision lands in a diff. On top of those, a scan blocks linking a skill that bundles an executable, carries a credential, or tries to override the agent's instructions.

Generated skills (`origin: captured` or `derived`) will not link at all under the default `audit_only` mode. They sit in the repo as reviewable, inert markdown until you set `GODKIT_EVOLVE_MODE=autonomous` or pass `--force`. **`--force` overrides the mode; it never overrides a safety block.**

### Evidence

`godkit evolve` re-reads `.agent/log/*.md` and says what the evidence implies about each skill.

```bash
godkit evolve            # the report
godkit evolve --write    # project it to .agent/SKILLS.md
```

There is no separate store. A log entry lists the skills it used in its `skills:` frontmatter, and that plus `status:` and the `## Verified` and `## Bugs` sections is the whole signal. Edit a skill and bump `revised:`, and its evidence window resets — you are judging the text that exists now, not what its ancestor did.

| Level | Reached by |
|---|---|
| **trusted** | 3 successes across 3 *distinct* sessions, no failures |
| **provisional** | the default, and where a trusted skill lands after one attributable failure |
| **quarantined** | 2 failures, a blocking safety finding, or `enabled: false` — will not link, even with `--force` |

> **What "trusted" actually means, precisely: *used repeatedly, and the sessions that used it finished verified*.**

Godkit does not run your agent, so it cannot observe a skill being used. The `skills:` field is a self-report by the same agent that just used it, and self-reports skew positive. This is a usage/outcome **correlation, not a quality measure**, and a trusted skill can still be wrong. `godkit evolve` prints how many log entries it could not attribute at all, on every run, for exactly this reason.

Demotion is deliberately asymmetric — three sessions to promote, one failure to demote — because a wrong instruction auto-loaded into an agent's context costs more than a slow promotion. And a session that ends `blocked` with three skills listed blames none of them: attribution that guesses would demote good skills.

## The project map

`godkit-map` builds a graph of the codebase into `.agent/graph.json`, with a readable `.agent/MAP.md` projection. The deterministic half is a script — walk, categorize, resolve imports, group files that import each other into the same batch:

```bash
godkit scan     # walk, categorize, resolve imports, batch
godkit save     # normalize, write graph.json + MAP.md + meta.json
```

The judgment half is the model: what each thing is *for*, how the layers actually divide, and where the landmines are.

**Recall is grep, not load.** Node ids are `type:path[:name]`, so finding a concept and then its one-hop neighbourhood costs two greps and no context:

```bash
rg '"summary"' .agent/graph.json | rg -i token
rg 'function:src/auth/token.ts:isExpired' .agent/graph.json    # every caller
```

Refreshes are incremental. The map records the commit it was built at; the classifier decides how much to redo — `SKIP`, `PARTIAL`, `ARCHITECTURE` or `FULL` — so a two-file change never triggers a full rebuild.

A file's structural signature is derived from the graph itself rather than a second store, which means the two can never disagree. The save path also refuses to overwrite a graph it could not read, so one bad parse cannot quietly reset your project's memory.

## Design

- **Zero runtime dependencies.** Node standard library only, in the package and in the tests. No install step, nothing to audit, nothing to break.
- **One source of truth per fact.** `AGENTS.md` generates every rule file. `graph.json` generates `MAP.md` and its own freshness signatures. A generated file cannot be edited in the wrong place.
- **Derive, do not duplicate.** Skill trust comes from the log stream rather than a second store, because a stale record would actively mislead the next agent.
- **Hooks never throw.** Malformed input, missing git, absent `.agent/` — all exit 0.
- **Nothing absolute is ever committed.** Paths in the graph are sanitized to the project root, so no machine layout or username ships in your repo.
- **Deliberate shortcuts are marked** with a `godkit:` comment naming the ceiling and the upgrade path. An unmarked shortcut is indistinguishable from a mistake.

## Development

```bash
npm test                            # node --test, no framework
node scripts/sync-rules.js          # regenerate the rule copies from AGENTS.md
node scripts/sync-rules.js --check  # fail if any drifted (runs in CI)
node scripts/check-versions.js      # all four manifests agree on the version
```

`npm test` runs `pretest` first, so the rule-sync and version checks gate the suite. CI runs the same three steps across `{ubuntu, windows} × {node 18, 22, 24}`.

Contributions follow the protocol the tool describes: read `.agent/BOARD.md`, claim your scope, and leave a log entry. Adding a skill means a `skills/<name>/SKILL.md` with frontmatter and a `## Boundaries` section, plus a matching `commands/<name>.toml` — the contract tests enforce both.

## License

MIT © [CodeForFee](https://github.com/CodeForFee)
