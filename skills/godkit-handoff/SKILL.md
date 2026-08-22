---
name: godkit-handoff
description: >
  The shared-state protocol for a repo worked on by several AI agents — Claude, Cursor, Codex,
  Antigravity, or the same tool across different sessions. Defines .agent/BOARD.md (who is
  working where, open and fixed bugs, binding decisions), .agent/THREAD.md (the append-only
  conversation between agents), .agent/tasks/ (one file per task, carrying plan, execute,
  review, test and handoff), and .agent/log/ (one append-only entry per session), plus the
  clock-in and clock-out checklists that keep them true. Use at the START of any session that
  will edit code, at the END of any session that did, and whenever the user says "resume",
  "continue", "what was done", "who did what", "hand off", "log this", "pick up where X left
  off", asks whether a bug was already fixed, or mentions another tool or agent working on the
  same project. Also use when there is no .agent/ directory yet and work is about to start.
license: MIT
---

# Handoff

You share this repo. Another agent — a different model, a different tool, a different day — will read what you leave and will trust it. Two rules make that work, and they are not negotiable:

**Read the board before you edit. Write your log before you finish.**

Everything else on this page is the shape of those two.

## The shared state

All of it lives in the repo and is committed. In the repo because Cursor cannot read Claude's memory directory and Claude cannot read Cursor's — **the only shared memory between tools is the filesystem they both open**.

```
.agent/
├── BOARD.md              one screen, current truth, rewritten often
├── THREAD.md             append-only conversation between agents
├── MAP.md                what this codebase is (generated — see godkit-map)
├── graph.json            the machine-readable map
├── tasks/
│   └── T-003-token-refresh.md
└── log/
    ├── 2026-08-19T1102Z-cursor.md
    └── 2026-08-19T1403Z-claude-82df4726.md
```

One log file per session, never edited by anyone else, is the whole trick: two tools writing at the same moment never conflict, and git merges them without a thought. The board stays small enough that conflicts there are rare and trivial.

### `.agent/BOARD.md`

Sections: **Roster** (which providers exist here, what each can do, what each costs), **Now** (open claims), **Tasks** (the index), **Bugs**, **Decisions**, **Last 3 handoffs**. Keep it to one screen — the moment it needs scrolling, it stops being read.

### `.agent/tasks/T-NNN-<slug>.md`

One file per task, carrying all five phases as sections that fill in as work moves. Frontmatter is the machine-readable part:

```markdown
---
id: T-003
title: fix token refresh loop
owner: claude
scope: src/auth/*        # file globs — this is what makes overlap detectable
phase: execute           # plan | execute | review | test | done | blocked
exit: `npm test auth` green and no refresh loop over a 2h session
created: 2026-08-19T1340Z
---

## Plan
## Execute
## Review
## Test
## Handoff
```

`scope` and `exit` are not optional. A task with no exit condition cannot be finished, only abandoned. **Handoff may not be empty unless `phase: done`.**

Ids are monotonic and never reused. A finished task keeps its file — that is the record of why the code looks the way it does.

### `.agent/THREAD.md`

For messages that need a reader. Append only, newest at the bottom, never edit someone else's block:

```markdown
## 2026-08-19T1403Z · claude · T-003
@cursor — token refresh done, `src/auth/*` released. The `+email` 500 is B-004, still open,
I did not touch it. Blocking on: nothing.
---
```

Use it when another agent must know something to act: you released a claim they were waiting on, you found a bug in their scope, you need a decision. Findings and reasoning go in your log; the thread is for things addressed to someone.

### `.agent/log/<UTC>-<agent>[-<session8>].md`

Filename sorts chronologically: `2026-08-19T1403Z-claude-82df4726.md` — timestamp, tool, then the first 8 characters of the session id if the tool has one.

```markdown
---
agent: claude-opus-5
session: 82df4726
started: 2026-08-19T13:40Z
ended: 2026-08-19T14:03Z
scope: src/auth/*
status: done          # done | partial | blocked
---

## Task
One line. What you were asked to do.

## Did
- guard the expiry comparison — src/auth/token.ts:88
- drop the now-dead retry wrapper — src/auth/refresh.ts:12-31

## Verified
- `npm test auth` → 14 pass
- manual: login with a `+` in the email → still 500 (B-004, not mine)

## Bugs
- fixed B-003 — refresh loop. Root cause was the shared `isExpired`, not the caller the report named.
- found B-004 — login 500 on `+` in email. Open, added to board.

## Decisions
- httpOnly cookie over localStorage — XSS.

## Left / next
- no test yet for the `+email` case
- did NOT touch src/auth/session.ts — cursor holds that claim
```

Sections may be empty. **"Left / next" may not be empty when status is `partial` or `blocked`** — that section is the entire reason the next agent can start.

## Clock in

Before your first edit, every session:

1. **Read `.agent/BOARD.md`.** No `.agent/`? Run `godkit init` and continue. One time, ten seconds, do not ask permission.
2. **Read `.agent/MAP.md`.** Stale or missing? Refresh it — see **godkit-map**. A stale map is worse than no map, because you will act on it.
3. **Read the newest two log entries**, plus any whose `scope` overlaps files you will touch: `grep -l "src/auth" .agent/log/*.md`.
4. **Read the THREAD tail.** Someone may be blocked on you.
5. **Check the bug list before fixing anything.** Already `[x]`? Read that log entry — either it regressed (say so, new id) or you were about to redo finished work.
6. **Check the decisions.** They bind you. If one is wrong, argue with the user and record the reversal; never silently contradict it.
7. **Claim your scope** — a row in *Now* with file globs, your task, UTC time, `wip`.

**If your scope overlaps an open claim, stop.** Do not edit. Options, in order: pick a non-overlapping seam; do the work the claim holder listed under Handoff for a *different* file; or, if the claim is older than 24h, mark it `stale`, take it over, and note the takeover in your log. Never two owners on one file.

## While working

- Scope grew past your claim? **Widen the claim before touching the new files**, not after.
- Found a bug outside your scope? Add it as a new `B-NNN` and keep going. Do not fix it — that is someone's claimed file, and an unclaimed drive-by fix is exactly the collision this protocol prevents.
- Moved a task to a new phase? Update its frontmatter as you go, not at the end.

## Clock out

Before your turn ends — every session that touched a file:

1. **Write the log entry.** Concrete paths with line numbers, real commands with their real output. "Refactored auth" helps nobody.
2. **Update the task file** — fill the phase section you worked, set `phase:`, write Handoff.
3. **Update the board** — release your claim, close or add bugs, add any decision, prepend one line to *Last 3 handoffs* and trim to three.
4. **Post to THREAD** if another agent is waiting on something you just changed.
5. **Bug bookkeeping**: `B-NNN` ids are monotonic and never reused or renumbered. A fixed bug stays with `[x]`, its fix location and its log pointer — that is how the next agent tells "already fixed" from "never looked at". Record the **root cause location**, not the symptom: a sibling caller may still be broken, and the next agent needs to know where you actually cut.
6. **Commit `.agent/` with your code change.** The log and the diff belong in the same commit; separated, they drift.

## Memory: what goes where

Four tiers. Putting a fact in the wrong one is how knowledge gets lost.

| Tier | Lives in | Holds | Who reads it |
|---|---|---|---|
| **Map** | `.agent/MAP.md`, `graph.json` | what the codebase *is* | every agent, on arrival |
| **Board** | `.agent/BOARD.md` | current claims, bugs, binding decisions | every agent, first thing |
| **Log** | `.agent/log/*.md` | what happened this session | every agent, forever |
| **Private** | the tool's own store | user preferences, tool quirks, cross-project habits | that one tool only |

Rules:

- **If another agent needs it, it goes in `.agent/`.** Private memory is invisible to every other tool. A decision recorded only in Claude's memory does not exist for Cursor.
- **Do not record what the repo already records.** Code structure, git history, what a function does, a fix you already logged — all already written down. Memory that duplicates the repo goes stale and then lies.
- Private memory is for what the repo cannot say: how the *user* wants to work, which tool broke on what, standing preferences.
- In doubt, put it under Decisions on the board. Every tool can read it.

## Splitting work across tools

- **One owner per file.** Split seams on file boundaries, never on layers that share files.
- Two seams must touch one file → **serialize them**. The wall-clock you save is smaller than the merge bug you buy.
- Each parallel worker gets its own claim, its own scope, its own log entry.
- **The join is a gate**: after the parallel work merges, one agent runs the full check suite and logs the result. Nobody is done until the join passes.

## Output

After clocking out, one line:

`logged: .agent/log/<file> — <status>. board: <claim released | B-00N fixed | decision added>.`

No summary of the summary. The log entry is the record; the chat is not.

## Boundaries

This skill defines the protocol and its file formats. It does not decide *what* work to do (**godkit-plan**), how to run it (**godkit-execute**), or what the codebase is (**godkit-map**).
