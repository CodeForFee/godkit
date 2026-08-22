---
name: subagent-help
description: >
  Quick-reference card for the subagent skill set — the work decomposition ladder, the .agent/
  shared-state layout, the clock-in and clock-out checklists, every skill with its trigger, and
  where to install the set for each tool. One-shot display, not a persistent mode. Trigger:
  /subagent-help, "subagent help", "what subagent commands", "how does the handoff work",
  "where do the logs go", "how do I install this for cursor/codex".
---

# Subagent — reference card

Ponytail governs **what you build**. Subagent governs **how the work is organized**.

## The two rules

**Read `.agent/BOARD.md` before you edit. Write `.agent/log/<entry>.md` before you finish.**

Everything else is detail.

## Shared state

```
.agent/
├── BOARD.md      claims (who owns which files) · bugs B-NNN open/fixed · decisions · last 3 handoffs
└── log/          one file per session: <UTC>-<agent>[-<session8>].md, append-only, never edited by others
```

In the repo, committed to git. It is the only memory two different tools can both read.

## Clock in → work → clock out

| | |
|---|---|
| **in** | read board → read newest 2 logs (+ any overlapping your files) → check bugs already fixed → **claim your scope** |
| **work** | scope grew? widen the claim first. Bug outside your scope? log it as `B-NNN`, do not fix it |
| **out** | write log entry → release claim, update bugs/decisions/handoffs → commit `.agent/` with the code |

Overlapping claim → **do not edit**. Re-scope, or take over a claim older than 24h and say so.

## Everything is a plugin

Agents, tools, scripts, MCP servers — all providers of the same contract: **scope in → verified
result + log entry out**. Route each seam in two steps, never one:

**capability first** (drop anything that cannot do it — reject loud, never dispatch and hope)
**then cheapest**:

| Rung | Seam | Cost |
|---|---|---|
| 0 | "does X exist", "which callers", "did it pass" → a command (`rg`, tests, `tsc`) | free |
| 1 | you already have the context → this turn | no spawn |
| 2 | single-file edit, stub, test, mechanical rename → cheap tier | low |
| 3 | root cause, multi-file refactor, planning → strong tier | worth it |
| 4 | many independent seams → cheap fan-out + one strong joiner | mixed |

Strong tier is for **judgment, not typing**. Verification takes the cheapest thing that can prove
it — a test run beats a model reading a diff. Who is available lives under `## Roster` on the
board.

## The ladder

| Rung | When | Do |
|---|---|---|
| 0 | always | read the handoff, claim your scope |
| 1 | fits this turn | just do it |
| 2 | sequential, one session | step through with checkpoints |
| 3 | natural seams | split on **file boundaries**, scope + exit + verify each |
| 4 | needs a specialist | one scoped subagent, minimum tools |
| 5 | true parallelism | disjoint file sets, gate on the join |
| 6 | needs iteration | goal-driven, hard max-rounds cap |
| 7 | only then | full orchestration |

## Non-negotiables

- one owner per file — shared file means serialize, never parallelize
- every delegation: scope, exit condition, verification
- verify against the world, never the return value
- retry only on verified advancement
- depth 3+ means the seams were cut wrong
- partial success is two facts, and both go in the log

## Skills

| Skill | Trigger |
|---|---|
| `subagent` | any multi-step task; delegate, split, orchestrate |
| `subagent-handoff` | session start/end, "resume", "who did what", "was this bug fixed" |
| `subagent-plan` | "split this up", "who should do what", "can we parallelize" |
| `subagent-execute` | carrying out a plan, verifying delegated work, deciding whether to retry |
| `subagent-review` | "review the process", agents colliding, duplicated effort |
| `subagent-postmortem` | "why did that fail", loops, lost context, agents undoing each other |
| `subagent-help` | this card |

`subagent/references/PATTERNS.md` — the underlying harness patterns. Load only when designing a
mechanism, not for ordinary work.

## Install

The set is plain SKILL.md files (agentskills.io standard). Copy or symlink the skill directories
into the tool's skills folder:

| Tool | Path |
|---|---|
| Claude Code | `~/.claude/skills/` or `<project>/.claude/skills/` |
| Codex CLI | `~/.codex/skills/` |
| Gemini CLI | `~/.gemini/skills/` |
| Cursor / Copilot / Windsurf / Kiro | their skills folder, same format |

**Enforcement** — a skill is model-invoked, so it can be skipped. The always-on stubs cannot be:

- `AGENTS.md` at the repo root — read by Codex, Cursor, Gemini, and most others
- `.cursor/rules/subagent.mdc` — `alwaysApply: true`
- `.github/copilot-instructions.md`
- `hooks/agent-brief.js` (install with `node hooks/install.js`) — Claude Code: injects the board at session
  start, and **blocks the turn** at Stop until this session's log entry exists

Copy the stubs into each repo you work in. Details in `README.md`.
