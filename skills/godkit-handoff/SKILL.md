---
name: godkit-handoff
description: >
  The shared-state protocol: BOARD.md (claims, bugs, decisions), THREAD.md, tasks/, log/, and the
  clock-in and clock-out checklists. Use at the START of a session that will edit code, at the END
  of one that did, when there is no .agent/, or on "resume", "continue", "what was done", "who did
  what", "hand off", "log this", "was this bug already fixed", or another tool working the same
  repo.
license: MIT
---

# Handoff

You share this repo. Another agent — a different model, a different tool, a different day — will read what you leave and will trust it. Two rules make that work, and they are not negotiable:

**Read the board before you edit. Write your log before you finish.**

Everything else on this page is the shape of those two.

## The shared state

Writing a board entry, task file or log and unsure of the format? Read `references/formats.md` — the `.agent/` layout, BOARD sections, and the task and log templates `godkit verify` parses.

## What `godkit verify` checks

These were rules nobody enforced, so a task could sit at `done` with nothing behind it and the
next agent would inherit a claim instead of a result. `godkit verify` reads `.agent/tasks/` and
`.agent/log/` and reports, using **godkit-review**'s own tags:

| Tag | Fires on |
|---|---|
| `no-exit` | a task with an empty `scope:` or `exit:`, or one past `plan` still owned by `unassigned` |
| `no-verify` | `phase: done` with an empty `## Test`, or `status: done` with an empty `## Verified` |
| `resume-blocked` | a task past `plan` and short of `done` with an empty `## Handoff`; a log at `partial` or `blocked` with an empty `## Left / next`; a `blocked` task with no typed reason |

It is **structural** — present, non-empty, not the template's own placeholder comment. It cannot
tell whether your evidence is any good; that is what **godkit-review** is for. It exits non-zero,
so it works in CI, and the Stop hook enforces exactly one of these: a log claiming `status: done`
with an empty `## Verified` blocks the clock-out.

### `blocked:` — say which kind of blocked

`blocked` alone tells the next agent that work stopped, not whether they can do anything about
it. When `phase: blocked`, name the reason:

| Value | The next agent should |
|---|---|
| `needs-decision` | ask the user — do not guess and do not proceed |
| `needs-evidence` | go verify the specific fact, then continue |
| `external-wait` | not retry; pick up other work and check back |
| `needs-owner` | check the board and hand it to whoever holds that scope |

Anything else, or nothing, is a `resume-blocked` finding.

## Clock in

Before your first edit, every session:

1. **Read `.agent/BOARD.md`.** No `.agent/`? Run `godkit init` and continue. One time, ten seconds, do not ask permission.
2. **Read `.agent/MAP.md`.** Stale or missing? Refresh it — see **godkit-map**. A stale map is worse than no map, because you will act on it.
3. **Read the log entries whose `scope` overlaps files you will touch** — the brief lists the newest one line each; `godkit recall src/auth` finds older ones, archive included.
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

1. **Write the log entry.** Concrete paths with line numbers, real commands with the one to five output lines that decide them — not the whole dump. "Refactored auth" helps nobody. List any `.agent/skills/` skill you used in `skills:` — that self-report is the only evidence those skills ever get.
2. **Update the task file** — fill the phase section you worked, set `phase:`, write Handoff.
3. **Update the board** — release your claim, close or add bugs, add any decision, prepend one line to *Last 3 handoffs* and trim to three.
4. **Post to THREAD** if another agent is waiting on something you just changed.
5. **Bug bookkeeping**: `B-NNN` ids are monotonic and never reused or renumbered. A fixed bug stays with `[x]`, its fix location and its log pointer — that is how the next agent tells "already fixed" from "never looked at". Record the **root cause location**, not the symptom: a sibling caller may still be broken, and the next agent needs to know where you actually cut.
6. **Commit `.agent/` with your code change.** The log and the diff belong in the same commit; separated, they drift.

The rest is automatic where hooks run: after a verified clock-out, old fixed bugs, older handoffs and old thread blocks move to `.agent/archive/` (moved, never deleted — `godkit recall` searches them), `.agent/SKILLS.md` is refreshed, and new project skills that pass the safety scan are linked. Do not trim the board by hand beyond the handoff list.

## Memory: what goes where

Unsure whether something belongs in the board, the thread, a log, a task or a skill? Read `references/memory.md`.

## Splitting work across tools

- **One owner per file.** Split seams on file boundaries, never on layers that share files.
- Two seams must touch one file → **serialize them**. The wall-clock you save is smaller than the merge bug you buy.
- Each parallel worker gets its own claim, its own scope, its own log entry.
- **The join is a gate**: after the parallel work merges, one agent runs the full check suite and logs the result. Nobody is done until the join passes.
- For the actual git mechanics of running claims in parallel — worktrees, committing as the checkpoint, merging `.agent/` itself — see **godkit-git**.

## Output

After clocking out, one line:

`logged: .agent/log/<file> — <status>. board: <claim released | B-00N fixed | decision added>.`

No summary of the summary. The log entry is the record; the chat is not.

## Boundaries

This skill defines the protocol and its file formats. It does not decide *what* work to do (**godkit-plan**), how to run it (**godkit-execute**), or what the codebase is (**godkit-map**).
