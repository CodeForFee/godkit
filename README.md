# Godkit

[![CI](https://github.com/CodeForFee/godkit/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/CodeForFee/godkit/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

**One shared harness for every AI agent.** Claude Code, Cursor, Codex and Antigravity all point at the same repo — so give them the same memory, the same board, and the same rules.

```bash
npx godkit init
```

---

## Contents

- [The problem](#the-problem)
- [What Godkit does](#what-godkit-does)
- [Install](#install)
  - [Hooks](#hooks-claude-code-codex)
  - [godkit-lazy modes](#godkit-lazy-modes)
- [The project map](#the-project-map)
- [Skills](#skills)
- [Project skills](#project-skills)
- [Design](#design)
- [Development](#development)
- [License](#license)

## The problem

Every agent arrives blind. It does not know what the project is, what was already done, which file someone else is holding, or what was decided last week. So work gets redone, two agents edit the same file, and every session starts by re-reading the codebase from scratch.

Private memory does not fix this: Cursor cannot read Claude's memory directory, and Claude cannot read Cursor's. **The only shared memory between tools is the filesystem they both open.**

## What Godkit does

It puts one committed directory in your repo, and teaches every agent to use it.

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

An agent arriving at a project reads the board and the map, claims a scope, writes its tasks out as files, and leaves a log the next agent can resume from. Overlapping claims stop it before it edits. On Claude Code, a Stop hook blocks the turn until the log exists.

Append-only everywhere is deliberate: one log file per session means two tools writing at the same moment never conflict, and git merges them without a thought.

## Install

```bash
npm install -g godkit

godkit install          # skills -> claude, codex, antigravity
godkit init              # scaffold .agent/ + rule files into the current repo
godkit skills            # this project's own skills; --link to expose them to hosts
godkit doctor            # what is set up, and whether the map is stale
```

| Tool | Skills | Always-on rules | Hooks |
|---|---|---|---|
| **Claude Code** | `~/.claude/skills/` | `CLAUDE.md` | yes |
| **Cursor** | — | `.cursor/rules/godkit.mdc` | not supported |
| **Codex** | `~/.agents/skills/` | `AGENTS.md` | yes |
| **Antigravity** | `~/.gemini/antigravity/skills/godkit` | `.agents/rules/godkit.md` | not supported |

`godkit install` places the skills once per machine; `godkit init` writes the rule files once per project. Every rule file is generated from a single `AGENTS.md`, so they cannot drift apart — CI byte-compares them.

Where a tool has no hook support, the always-on rule file *is* the enforcement. That is why they all say the same thing.

### Hooks (Claude Code, Codex)

```bash
node hooks/install.js                  # ~/.claude/settings.json
node hooks/install.js --uninstall
```

Re-running is safe: it drops its own previous entries first, leaves other tools' hooks alone, and writes a `.bak`. If it cannot parse your settings file it changes nothing and says so.

| Hook | Event | Does |
|---|---|---|
| `brief.js` | `SessionStart` | injects the board, map freshness, and the newest log entries |
| `lazy-activate.js` | `SessionStart` | resolves the active `godkit-lazy` mode and injects its ruleset |
| `lazy-subagent.js` | `SubagentStart` | injects the same `godkit-lazy` ruleset into spawned subagents |
| `lazy-mode-tracker.js` | `UserPromptSubmit` | tracks `/godkit-lazy` mode switches for the rest of the session |
| `clockout.js` | `Stop` | blocks the turn if files changed and no log was written |
| `map-watch.js` | `PostToolUse` (Bash) | after a commit or merge, says if the map went stale |

### godkit-lazy modes

Where the hooks are installed, `godkit-lazy` runs every session automatically, at a level resolved in this order: the `GODKIT_LAZY_MODE` env var, then `defaultMode` in `~/.config/godkit/config.json` (`%APPDATA%\godkit\config.json` on Windows), then `full`.

```
/godkit-lazy [lite|full|ultra|off]           switch for this session (no argument reports the level)
/godkit-lazy default [lite|full|ultra|off]   persist the default for new sessions
```

Injects into every subagent spawned via the Agent tool too — scope that with `GODKIT_LAZY_SUBAGENT_MATCHER` (a regex tested against the subagent's type) if some agent types should skip it.

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

## Skills

| Skill | Use for |
|---|---|
| `godkit` | arriving at a project, synthesizing and splitting the work |
| `godkit-map` | building or refreshing the project map |
| `godkit-handoff` | the `.agent/` protocol and its file formats |
| `godkit-plan` | cutting seams, assigning owners, writing task files |
| `godkit-execute` | running work through the pipeline, error recovery |
| `godkit-review` | reviewing the process, or diagnosing a failed run |
| `godkit-test` | what counts as verified, writing the check |
| `godkit-lazy` | what to build and what to skip |
| `godkit-git` | worktrees, commit-as-checkpoint, merging `.agent/` |
| `godkit-doubt` | pressure-testing a decision before it binds everyone |
| `godkit-frontend` | design taste — dials, banned defaults, 11 style/workflow variants |
| `godkit-output-enforcement` | catching stubbed or truncated generated output |
| `godkit-evolve` | capturing, deriving and fixing this project's own skills |
| `godkit-help` | quick reference card |

## Project skills

The 13 skills above ship with godkit and are the same everywhere. A *project* also accumulates
its own procedures — a fixture reset, a release check, a migration dance. Those live in
`.agent/skills/<name>/SKILL.md`: committed, tool-neutral, and linked into the paths Claude Code
and Codex actually read.

```bash
godkit skills                      # list them: origin, safety findings, which hosts see them
godkit skills --link               # link into .claude/skills/ and .agents/skills/
godkit skills --unlink
```

Write one with the `godkit-evolve` skill, or by hand. Two things keep a generated skill from
being dangerous, and the pattern scan is neither of them: it is **inert until linked** (no host
reads `.agent/skills/`), and `.agent/` is **committed**, so every skill and every revision lands
in a diff. On top of those, a scan blocks linking a skill that bundles an executable, carries a
credential, or tries to override the agent's instructions.

Generated skills (`origin: captured` or `derived`) will not link at all under the default
`audit_only` mode — they sit in the repo as reviewable, inert markdown until you set
`GODKIT_EVOLVE_MODE=autonomous` or pass `--force`. `--force` overrides the mode; it never
overrides a safety block.

## Design

- **Zero runtime dependencies.** Node standard library only, in the package and in the tests.
- **One source of truth per fact.** `AGENTS.md` generates every rule file. `graph.json` generates `MAP.md` and its own freshness signatures.
- **Hooks never throw.** Malformed input, missing git, absent `.agent/` — all exit 0. A broken hook must not break the session it was meant to help.
- **Nothing absolute is ever committed.** Paths in the graph are sanitized to the project root, so no machine layout or username ships in your repo.
- **Deliberate shortcuts are marked** with a `godkit:` comment naming the ceiling and the upgrade path. An unmarked shortcut is indistinguishable from a mistake.

## Development

```bash
npm test                          # node --test, no framework
node scripts/sync-rules.js        # regenerate the rule copies
node scripts/sync-rules.js --check
```

## License

MIT © [CodeForFee](https://github.com/CodeForFee)
