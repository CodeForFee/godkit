# Godkit — shared agent harness

You are not the only agent in this repo. Someone worked here before you and someone will work here after you — a different model, a different tool, a different day, with none of your context. Work that cannot be resumed is work you will pay for twice.

Two rules, not negotiable:

**Read `.agent/` before you edit. Write your log before you finish.**

## Clock in

Before your first edit, every session:

1. Read `.agent/BOARD.md` — who is working where, which bugs are open, which are already fixed, which decisions bind you.
2. Read `.agent/MAP.md` for what this codebase is. Stale or missing? Refresh it before you rely on it.
3. Read the newest two entries in `.agent/log/`, plus any entry whose `scope` overlaps the files you are about to touch.
   If `.agent/skills/` exists, read `.agent/SKILLS.md` — this project keeps its own skills, and one of them may already do what you are about to work out from scratch.
4. Check the bug list before fixing anything. Already `[x]`? Either it regressed — new id, say so — or you were about to redo finished work.
5. **Claim your scope** on the board: file globs, your task, UTC time, `wip`.

No `.agent/` directory? Create it and continue. One time, ten seconds, do not ask permission.

**If your scope overlaps an open claim, stop. Do not edit.** Take a non-overlapping seam; or do something the holder listed under Handoff for a *different* file; or, if the claim is over 24h old, mark it `stale`, take it over, and say so in your log. Never two owners on one file.

## While working

- Scope grew past your claim? Widen the claim **before** touching the new files, not after.
- Found a bug outside your scope? Add it to the board as a new `B-NNN` and keep going. Do not fix it — that is someone's claimed file, and a drive-by fix is exactly the collision this prevents.
- Talk to the other agents in `.agent/THREAD.md`. Append only, never edit someone else's block.

## Clock out

Every session that touched a file, before your turn ends:

1. **Write `.agent/log/<UTC>-<agent>[-<session8>].md`** — real file paths with line numbers, real commands with their real output. "Refactored auth" helps nobody. List any `.agent/skills/` skill you used in the `skills:` frontmatter field — that self-report is the only evidence those skills ever get.
2. **Update the board** — release your claim, open or close bugs, record any decision, prepend one line to the handoff list.
3. **Bug ids `B-NNN` are monotonic and never reused.** A fixed bug stays listed with `[x]`, its **root-cause location** (not the symptom) and its log pointer — that is how the next agent tells "already fixed" from "never looked at".
4. Commit `.agent/` in the same commit as the code. Separated, they drift.

`status: partial` or `blocked` makes "Left / next" mandatory, and specific enough for a different tool to resume cold. An unlogged session is invisible work — the next agent will assume it never happened, and be right to.

## How to split work

Stop at the first rung that holds:

1. Fits in this turn? Do it. No decomposition, no delegation, no plan document.
2. Sequential in this session? Step through it with checkpoints.
3. Has natural seams? Split on **file boundaries**, never on abstract layers that share files. Each seam gets scope, exit condition, verification.
4. Needs a specialist? One scoped worker, with only the tools that scope needs.
5. Needs real parallelism? Fan out over **disjoint file sets**, then gate on the join — one agent runs the full check suite after the merge.
6. Needs iteration? Hard max-rounds cap and a measurable exit condition. No cap means no loop.

Route each seam to the cheapest provider that *can* do it: a command (`rg`, the test suite, `tsc --noEmit`, `git log`) before a model, this turn before a spawn, a small model before a strong one. The strong tier is for judgment, not for typing. Check capability before dispatch and fail loud — a silently degraded result is worse than a refusal, because you will believe it.

Never accept a delegated result without verifying it. "It said it passed" is not evidence. Run the check.

## How to write the code

Stop at the first rung that holds:

1. Does this need to exist at all?
2. Does it already exist in this repo? Reuse it.
3. Does the standard library do it? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can it be one line? One line.
7. Only then: the minimum code that works.

The ladder runs *after* you understand the problem, not instead of it. Read the task and the code it touches, trace the real flow end to end, then climb. A bug report names a symptom — grep every caller and fix the shared function once; patching only the path the ticket names leaves a sibling caller broken.

No abstractions nobody asked for. No new dependency for what a few lines do. Deletion over addition, boring over clever, fewest files possible. Shortest working diff wins — but the smallest change in the wrong place is not lazy, it is a second bug.

Mark deliberate shortcuts that cut a real corner with a `godkit:` comment naming the ceiling and the upgrade path.

## Never simplify away

Reading the board, claiming your scope, verifying a delegated result, logging what you did — those four are the protocol. Beyond them: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, and anything explicitly requested. Non-trivial logic leaves one runnable check behind; trivial one-liners need none.
