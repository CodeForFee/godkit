---
name: subagent-review
description: >
  Review how work was organized, not whether the code is correct: unclaimed edits, missing
  handoff logs, seams that share files, delegations with no exit condition, results accepted
  without verification, serial chains that had no reason to be serial, context lost between
  agents. One line per finding — location, tag, what to change. Use when the user says "review
  the process", "review this orchestration", "why do our agents keep colliding", "did we split
  this right", "/subagent-review", or after a multi-agent run that produced rework, conflicts,
  or duplicated effort. Complements code review — this one never looks at correctness, only at
  how the work was organized.
---

# Orchestration review

You are reviewing the **process**, never the code. Whether the function is correct is somebody
else's job. Your question is: could the next agent pick this up, and did anyone step on anyone.

## Look at

- `.agent/BOARD.md` — claims, bug register, decisions, handoff list
- `.agent/log/*.md` — the recent entries
- `git log` and the diff — what actually changed
- the plan, if there was one

The comparison that matters: **what the logs claim versus what the diff shows**. Files changed
with no claim and no log entry are the finding that predicts every future collision.

## Tags

| Tag | Meaning |
|---|---|
| `no-handoff` | session edited files, left no log entry |
| `claim-collision` | two agents edited one file in overlapping windows |
| `unclaimed-edit` | files changed outside any claim on the board |
| `stale-board` | claim never released, bug fixed but still `[ ]`, decision contradicted by the code |
| `scope-leak` | the work drifted past its stated scope without widening the claim |
| `no-verify` | a result was accepted with no command or observation behind it |
| `no-exit` | a delegation with no checkable "done" |
| `serial-bottleneck` | independent seams run one after another for no reason |
| `over-delegate` | spawned a subagent for work that fit in the turn |
| `wrong-tier` | strong model spent on a seam a command, a cheap tier, or the current turn covered |
| `model-verify` | a model was asked to check what a command proves — expensive and weaker |
| `lost-context` | a child had to re-derive what the parent already knew |
| `depth-excess` | delegation three or more levels deep — the seams were cut wrong |
| `no-recovery` | retried without advancement, or gave up without diagnosing |
| `resume-blocked` | `status: partial` with a "Left / next" too vague to act on |

## Format

One line per finding. Location, tag, what happened, the fix.

```
.agent/log/: no-handoff — 6 files in src/api/ changed, no entry for that session. Write one now from git log.
BOARD.md:12: stale-board — claude claim on src/auth/* open since 2026-08-17, work landed. Release it.
plan S2/S3: serial-bottleneck — disjoint file sets run in sequence. Parallelize, join on full suite.
S4: no-verify — "migration applied" with no query behind it. Run the count, paste it.
```

End with one line:

`orchestration: clean.` or `orchestration: 4 findings — 1 blocking (no-handoff).`

**Blocking** means the next agent cannot safely start: missing log entry, open collision, board
that contradicts the code. Everything else is advice.

## Rules

- Findings only. No praise, no summary of what the team did well.
- Cite a real location — a file, a board line, a seam id. A finding you cannot point at is a
  feeling.
- Do not review code correctness. See it and it is genuinely dangerous? One line at the end,
  clearly marked as out of scope.
- Do not propose an orchestration heavier than the work. "Add a coordination doc" for a two-file
  change is the disease, not the cure.
- Nothing wrong? Say `orchestration: clean.` and stop. Inventing findings to look thorough wastes
  the next reader's attention.
