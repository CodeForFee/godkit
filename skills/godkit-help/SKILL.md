---
name: godkit-help
description: >
  Quick reference: .agent/ layout, the two rules, the ladders, the skills, CLI commands, install
  paths per tool. Use on "godkit help", "/godkit-help", "what godkit commands are there", "how does
  this work", "what skills are available", "where does .agent go", or how to install or set it up.
  One-shot, not a mode.
license: MIT
---

# Godkit — reference card

## The two rules

**Read `.agent/` before you edit. Write your log before you finish.**

Everything else is the shape of those two.

## Shared state

```
.agent/
├── BOARD.md              roster · claims · task index · bugs · decisions — one screen
├── THREAD.md             append-only conversation between agents
├── BRIEF.md              new projects only: what, who, stack, non-goals — until there is code
├── MAP.md                what this codebase is (generated)
├── graph.json            the machine-readable map
├── meta.json             commit sha the map was built at
├── SKILLS.md             this project's own skills (generated)
├── skills/<name>/        procedures this project repeats — see godkit-evolve
├── tasks/T-NNN-<slug>.md one per task: Plan · Execute · Review · Test · Handoff
├── log/<UTC>-<agent>.md  one per session, append-only, never edited by others
└── archive/              finished items moved off BOARD/THREAD — `godkit recall` searches it
```

Committed to the repo. Private per-tool memory is invisible across tools — the filesystem is the only shared memory. If another agent needs it, it goes in `.agent/`.

## Clock in / clock out

| In | Out |
|---|---|
| read BOARD, MAP, newest 2 logs, THREAD tail | write the log entry |
| check bugs before fixing | update the task file phase + Handoff |
| check decisions — they bind you | update the board, release the claim |
| **claim your scope** | post to THREAD if someone is waiting |

Overlap an open claim → **stop, do not edit.**

## Ladders

**Split the work** — stop at the first rung that holds:
1 fits this turn · 2 sequential here · 3 has seams (file boundaries) · 4 needs a specialist · 5 real parallelism over disjoint files · 6 bounded loop · 7 full orchestration

**Route each seam** — cheapest that *can* do it:
0 a command · 1 this turn · 2 small model · 3 strong model · 4 fan out + join gate

**Write the code** — stop at the first rung that holds:
1 needs to exist? · 2 already here? · 3 stdlib? · 4 native feature? · 5 installed dep? · 6 one line? · 7 minimum that works

## Non-negotiable

Reading the board · claiming your scope · verifying a delegated result · logging what you did.

Plus: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything explicitly requested.

## Skills

| Skill | Use for |
|---|---|
| `godkit` | arriving at a project, synthesizing and splitting the work |
| `godkit-map` | building or refreshing the project map |
| `godkit-handoff` | the `.agent/` protocol and its file formats |
| `godkit-plan` | cutting seams, assigning owners, writing task files |
| `godkit-execute` | running work through the pipeline, error recovery |
| `godkit-refactor` | evolving the source code — churn and blame from the logs |
| `godkit-review` | reviewing the process, or diagnosing a failed run |
| `godkit-test` | what counts as verified, writing the check |
| `godkit-lazy` | what to build and what to skip |
| `godkit-git` | worktrees, commit-as-checkpoint, merging `.agent/` |
| `godkit-doubt` | pressure-testing a decision before it binds everyone |
| `godkit-triage` | GitHub issues and PRs: fresh-base diffs, the posting gate, batches |
| `godkit-frontend` | design taste — dials, banned defaults, 11 style/workflow variants |
| `godkit-output-enforcement` | catching stubbed or truncated generated output |
| `godkit-evolve` | capturing, deriving and fixing this project's own skills |
| `godkit-help` | this card |

`skills/godkit/references/PATTERNS.md` — the underlying harness patterns. Load only when designing an orchestration mechanism.

## CLI

```
godkit init [path] [--new]  set up this project: .agent/, rule files, all 16 skills copied into
                            .claude/skills and .agents/skills; hooks once per machine.
                            Auto-detects a new project (no code) — --new only forces it.
godkit doctor               what is set up here, and whether the map is stale
godkit recall <file|words>  search all history — logs, board, thread, tasks, archive — bounded
godkit verify [--quiet]     tasks and logs against the template rules; non-zero on findings
godkit sprint [new "<goal>"|close]
godkit scan [path] · save   build the project map (godkit-map runs these)
godkit skills [--link|--unlink] [tool...] [--force]
                            this project's own skills in .agent/skills/
godkit evolve [--write]     what the logs say about each one; --write -> .agent/SKILLS.md
godkit refactor [--all]     what the logs say about each code file: churn, blame, fan-in
godkit hooks [status|install|uninstall] [--dry-run]
godkit install [tool...]    skills into ~/ for every project (init already covers this one)
godkit uninstall [tool|--project]   remove skills godkit placed; never touches .agent/
```

Not on PATH (installed via npx)? The session brief prints the exact `node ".../bin/godkit.js"`
line, or use `npx -y @codeforfee/godkit <cmd>`. Run from npx, `init` copies the package to
`~/.godkit/<version>/` first, so hooks never point into npm's prunable cache.

## Where things install

| Tool | Skills (per project, from `init`) | Always-on rules | Hooks |
|---|---|---|---|
| Claude Code | `.claude/skills/` | `CLAUDE.md` | `~/.claude/settings.json` |
| Codex | `.agents/skills/` | `AGENTS.md` | `~/.codex/hooks.json` |
| Cursor | read `.agents/skills/<name>/SKILL.md` on demand | `.cursor/rules/godkit.mdc` | not supported |
| Antigravity | read `.agents/skills/<name>/SKILL.md` on demand | `AGENTS.md`, `.agents/rules/godkit.md` | not supported |

The rules block carries a "Which skill, when" table, so every host picks the right skill without
the user naming it. Where hooks are not supported, the rule file is the enforcement — that is why
it says the same thing. Every rule file is generated from one source, so they cannot drift.

What runs by itself where hooks run: the session brief (≤3KB however long the history), scaffolding
`.agent/` in an empty folder or an opted-in clone, and after a verified clock-out, archiving
finished board items, refreshing `.agent/SKILLS.md` and linking new project skills.

## Boundaries

A reference card. It does not do the work; the skills above do.
