---
name: subagent-plan
description: >
  Decompose a task into seams that several agents or tools can work without colliding: read the
  handoff first, cut on file boundaries, give every piece a scope, an exit condition and a
  verification, then assign owners and sequence them. Use when a task is too big for one turn,
  when work must be split across Claude, Cursor, Codex or Gemini, when the user says "plan
  this", "split this up", "break this down", "who should do what", "can we parallelize this",
  or before any multi-file change where two agents might touch the same file. Do NOT use for
  work that fits in one turn — planning it costs more than doing it.
---

# Plan

A plan is not a document. A plan is a set of seams, each with an owner, an exit condition, and a
check — small enough that a cold agent in a different tool could pick one up and finish it.

## Before you plan: read the handoff

`.agent/BOARD.md` and the newest log entries. You cannot plan around claims you have not read, and
half of what you are about to plan may already be done. See **subagent-handoff**.

## Process

**1. Understand, then cut.** Read the task and trace the actual flow through the actual files
first. A clean decomposition of a misunderstood problem is still wrong, just in more pieces.

**2. Find the seams.** A seam is a boundary where one piece can be finished and verified without
the other pieces being done. Good seams:

- split on **file boundaries** — a seam owns files, exclusively
- have a narrow interface: what goes in, what comes out
- can be checked on their own

Bad seams: "the backend part" and "the frontend part" when both edit the shared types file. That
is one seam wearing a hat.

**3. Per seam, write three things.** No seam ships without all three:

| | |
|---|---|
| **Scope** | file globs, exclusive. Not "auth stuff" — `src/auth/*` |
| **Exit** | what "done" means, checkable by someone else |
| **Verify** | the command or observation that proves it. `npm test auth` → pass, not "looks right" |

**4. Sequence.** Which seams depend on which? Dependencies are almost always *interfaces*: seam B
needs the type seam A defines. Land the interface first, then both sides go parallel.

**5. Route each seam to a provider.** Every agent, tool, and script is a provider behind the same
interface — scope in, verified result plus log entry out. Read `## Roster` on the board for what
this project actually has, then route in two steps: **capability first, then cost.**

*Capability* — reject, do not degrade:

| Seam needs | Provider must have |
|---|---|
| edits across many files | repo access + a window that holds them |
| running the suite | shell permission |
| root-cause work | the whole call path in context, not one file |
| external calls | network, and credentials it is allowed to use |

Assigning work a provider cannot do produces a confident half-result — worse than a refusal,
because you will act on it.

*Cost* — cheapest rung that clears the bar:

| Seam | Route to | Why not higher |
|---|---|---|
| "does X exist", "which callers", "did the test pass" | a command — `rg`, the suite, `git log` | free, exact, cannot hallucinate |
| you already have the context | this turn | a spawn re-derives what you know |
| single-file edit, stub, test from a named behaviour, mechanical rename | cheap tier (inline Cursor/Codex, small model) | no judgment in it |
| multi-file refactor, root cause, planning, ambiguous requirements | strong tier | judgment is what you are paying for |
| many independent mechanical seams | cheap tier fanned out | + one strong joiner at the gate |

The expensive tier is for judgment, not for typing. And **one owner per file, always** — whatever
tier it is.

Verification routes the same way: the cheapest thing that can prove it. A test run beats a model
reading a diff, at roughly zero cost. Only reach for a model when no command can check it.

**6. Assign a rung** from the subagent ladder. Most seams are rung 1 or 2 — do it, do not delegate
it. Delegation starts at rung 3 and every rung costs a cold start and a verification.

## Output

Short. A table beats prose.

```
Seams (3), parallel after S1:

S1  src/auth/types.ts      define TokenPair            claude    exit: types compile, both sides import
                                                                 verify: `tsc --noEmit`
S2  src/auth/refresh.ts    use TokenPair in refresh    claude    exit: refresh loop gone (B-003)
                                                                 verify: `npm test auth` → pass
S3  src/ui/login.tsx       loading + error states      cursor    exit: both states render
                                                                 verify: manual, both paths

Order: S1 → (S2 ∥ S3) → join.
Join gate: full `npm test` after merge, by whoever lands second.
```

Then claim S1 on the board and start. A plan that is not claimed is a plan someone else will
duplicate.

## Rules

- **Never plan two owners onto one file.** If the split demands it, the split is wrong — re-cut,
  or serialize.
- **No seam without a verification.** "Then it works" is not an exit condition.
- **Parallelize only disjoint file sets.** Wall-clock saved is never worth a merge bug.
- **Every parallel fan-out needs a join gate** — one agent, full suite, after the merge, logged.
- **Do not plan past the first unknown.** If seam 2 depends on what seam 1 discovers, plan seam 1
  and say so. Speculative seams get thrown away.
- **Cap the depth.** A seam that needs its own sub-seams three levels down means the top-level cut
  was wrong. Back up and re-cut.
- Deliberate shortcuts get a `subagent:` note naming the ceiling
  (`subagent: S2 serial behind S1, could split per-provider if it drags`).

## Anti-patterns

- **Plan-shaped procrastination** — three seams for two hours of work. Do the work.
- **Phase names as seams** — "design / implement / test" is one seam described three times.
- **The unassigned seam** — no owner means everyone assumes someone else, or two people do it.
- **The unverifiable seam** — if you cannot say how to check it, you cannot say when it is done.
