---
name: godkit-review
description: >
  Review how work was ORGANIZED, and diagnose runs that went wrong: unclaimed edits, missing
  handoff logs, seams sharing files, delegations with no exit condition, results accepted without
  verification, loops that never ended, agents undoing each other. Use on "review the process",
  "why do our agents keep colliding", "why did that fail", "postmortem", "it looped forever", "it
  said done but it wasn't", "why did we do that twice", or after any multi-agent run that produced
  rework. Never judges code correctness — only how the work was organized.
argument-hint: "[--diagnose]"
license: MIT
---

# Review

Two modes, same evidence. **Review** when work finished and you want to know if the next agent can pick it up. **Diagnose** when something went wrong and you want the one reason.

## Look at

- `.agent/BOARD.md` — claims, task index, bug register, decisions, handoff list
- `.agent/log/*.md` — the recent entries
- `.agent/tasks/*.md` — exit conditions, phases, Handoff sections
- `.agent/THREAD.md` — messages that went unanswered
- `git log` and the diff — what actually changed

The comparison that matters: **what the logs claim versus what the diff shows.** Files changed with no claim and no log entry are the finding that predicts every future collision.

---

## Mode 1 — Review

### Tags

| Tag | Meaning |
|---|---|
| `no-handoff` | session edited files, left no log entry |
| `claim-collision` | two agents edited one file in overlapping windows |
| `unclaimed-edit` | files changed outside any claim on the board |
| `stale-board` | claim never released, bug fixed but still `[ ]`, decision contradicted by the code |
| `stale-map` | the map describes code that has since moved, and someone acted on it |
| `scope-leak` | work drifted past its stated scope without widening the claim |
| `no-verify` | a result was accepted with no command or observation behind it |
| `no-exit` | a task or delegation with no checkable "done" |
| `serial-bottleneck` | independent seams run one after another for no reason |
| `over-delegate` | spawned a worker for what fit in the turn |
| `wrong-tier` | strong model spent on a seam a command or a cheap tier covered |
| `model-verify` | a model asked to check what a command proves — expensive and weaker |
| `lost-context` | a child had to re-derive what the parent already knew |
| `depth-excess` | delegation three or more levels deep — the seams were cut wrong |
| `no-recovery` | retried without advancement, or gave up without diagnosing |
| `resume-blocked` | `partial` or `blocked` with a Handoff too vague to act on |
| `thread-dropped` | a THREAD message asked for something and nobody answered |

### Format

One line per finding. Location, tag, what happened, the fix.

```
.agent/log/: no-handoff — 6 files in src/api/ changed, no entry for that session. Write one now from git log.
BOARD.md:12: stale-board — claude claim on src/auth/* open since 2026-08-17, work landed. Release it.
T-008: no-exit — "improve error handling" with nothing checkable. Name the command that proves it.
plan S2/S3: serial-bottleneck — disjoint file sets run in sequence. Parallelize, join on full suite.
```

End with one line:

`orchestration: clean.` or `orchestration: 4 findings — 1 blocking (no-handoff).`

**Blocking** means the next agent cannot safely start: a missing log entry, an open collision, a board that contradicts the code. Everything else is advice.

---

## Mode 2 — Diagnose

One root cause. Not a list of everything that was suboptimal.

1. **What was supposed to happen** — one line. The exit condition, as stated at the time.
2. **What happened** — one line, from evidence: logs, `git log`, the transcript, the error. Not from memory.
3. **The first divergence.** Walk forward until behaviour first differs from intent. The failure surfaced later; the cause is here. Everything after it is a consequence.
4. **Tag it.**
5. **The smallest change that prevents a repeat.** One rule, one gate, one claim. If your fix is "be more careful", you have not found the cause.

### Tags

| Tag | Signature |
|---|---|
| `infinite-loop` | same action retried with unchanged inputs and unchanged state |
| `context-overflow` | ran out of window mid-task; state that mattered was never written down |
| `wrong-seam` | the split forced two workers into one file, or made a piece unverifiable alone |
| `scope-creep` | work drifted past its claim; the diff is much bigger than the task |
| `missing-gate` | a result was accepted with no verification, and was wrong |
| `capability-mismatch` | dispatched to a tool lacking the tools, permission, or window |
| `no-recovery` | failed and stopped with no diagnosis, or retried forever with no advancement |
| `stale-context` | acted on state that had changed — an old board, a fixed bug, a stale map |
| `no-handoff` | work redone or undone because the previous session left no log |
| `claim-collision` | two agents edited one file; both diffs correct alone, broken together |
| `silent-degradation` | a step half-succeeded and reported success; the caller believed it |

### Format

```
Root cause: <tag> at <where — file, task id, log entry, or turn>.
Chain: <what it caused, one line, only if not obvious>.
Fix: <the one process change>.
```

Example:

```
Root cause: no-handoff at .agent/log/ — the 08-17 cursor session left no entry.
Chain: claude re-fixed B-002 on 08-19 and reverted cursor's guard doing it.
Fix: the Stop hook blocks until a log entry exists, but it is not installed for Cursor —
     Cursor has no hooks, so its enforcement is .cursor/rules/godkit.mdc. Confirm it is there.
```

---

## Rules

- **Findings only.** No praise, no summary of what went well.
- **Cite a real location** — a file, a board line, a task id. A finding you cannot point at is a feeling.
- **One root cause when diagnosing.** Several tags fitting means you stopped before the first divergence. Keep walking back.
- **Evidence, not reconstruction.** Quote the log line, the error, the two conflicting diffs. A plausible story is not a diagnosis.
- **Fix the mechanism, not the person.** "The agent should have remembered" is not a fix — the next agent will not remember either. Make it structural: a hook, a claim, a gate, a template field.
- **The fix must be smaller than the failure.** Recommending a new coordination layer usually means misdiagnosing a missing one-line claim.
- **Do not propose orchestration heavier than the work.** "Add a coordination doc" for a two-file change is the disease, not the cure.
- Nothing wrong? Say `orchestration: clean.` and stop. Inventing findings to look thorough wastes the next reader's attention.

## Boundaries

This skill never judges whether the code is correct — that is ordinary code review. If you see something genuinely dangerous, one line at the end, clearly marked as out of scope.
