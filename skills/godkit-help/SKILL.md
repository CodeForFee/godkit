---
name: godkit-help
description: >
  Quick reference card for godkit: the .agent/ layout, the two non-negotiable rules, the ladders,
  the skill set, the CLI commands, and the install paths for Claude Code, Cursor, Codex and
  Antigravity. Use on "godkit help", "/godkit-help", "what godkit commands are there", "how does
  this work", "what skills are available", "where does .agent go", or how to install or set it up.
  One-shot display, not a mode.
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
├── MAP.md                what this codebase is (generated)
├── graph.json            the machine-readable map
├── meta.json             commit sha the map was built at
├── SKILLS.md             this project's own skills (generated)
├── skills/<name>/        procedures this project repeats — see godkit-evolve
├── tasks/T-NNN-<slug>.md one per task: Plan · Execute · Review · Test · Handoff
└── log/<UTC>-<agent>.md  one per session, append-only, never edited by others
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
godkit init [path]        scaffold .agent/ and the per-tool rule files into a project
godkit scan [path]        walk the project and group it into batches for the map
godkit save [file]        save a merged graph as the map (graph.json, MAP.md, meta.json)
godkit install [tool...]  install the skills (claude, codex, antigravity; default all)
godkit skills [--link|--unlink] [tool...] [--force]
                          this project's own skills in .agent/skills/
godkit evolve [--write]   what the logs say about each one; --write -> .agent/SKILLS.md
godkit refactor [--all]   what the logs say about each code file: churn, blame, fan-in
godkit verify [--quiet]   tasks and logs against the rules the templates state: an exit
                          condition, evidence behind done, a handoff behind everything
                          else. Non-zero on findings, so a hook or CI can stop on it.
godkit doctor             what is set up here, and whether the map is stale
godkit uninstall [tool]   remove installed skills (leaves your .agent/ alone)
```

## Where things install

| Tool | Skills | Always-on rules | Hooks |
|---|---|---|---|
| Claude Code | `~/.claude/skills/` | `CLAUDE.md` | yes — `hooks/godkit-hooks.json` |
| Cursor | — | `.cursor/rules/godkit.mdc` | not supported |
| Codex | `~/.agents/skills/` | `AGENTS.md` | yes — same format |
| Antigravity | `~/.gemini/antigravity/skills/godkit` | `.agents/rules/godkit.md` | not supported |

`godkit init` writes the rule files per project; `godkit install` puts the skills in place per machine. Every rule file is generated from one source, so they cannot drift.

Where hooks are not supported, the rule file is the enforcement — that is why it says the same thing.

## Boundaries

A reference card. It does not do the work; the skills above do.
