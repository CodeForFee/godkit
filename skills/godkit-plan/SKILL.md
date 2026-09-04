---
name: godkit-plan
description: >
  Cut a task into seams several agents can work without colliding: read shared state first, split
  on FILE boundaries, give each seam a scope, exit condition and verification, assign an owner from
  the roster, write them to .agent/tasks/ and claim yours. Use when a task is too big for one turn,
  when work spans Claude, Cursor, Codex or Antigravity, on "plan this", "split this up", "break
  this down", "who should do what", "can we parallelize this", or before any multi-file change two
  agents might collide on. Do NOT use for work that fits in one turn.
license: MIT
---

# Plan

A plan is not a document. A plan is a set of seams, each with an owner, an exit condition and a check — small enough that a cold agent in a different tool could pick one up and finish it.

## Before you plan: read the shared state

`.agent/BOARD.md`, `.agent/MAP.md` and the newest log entries. You cannot plan around claims you have not read, and half of what you are about to plan may already be done. See **godkit-handoff**.

## Process

**1. Understand, then cut.** Read the task and trace the actual flow through the actual files first. A clean decomposition of a misunderstood problem is still wrong, just in more pieces. The map makes this cheap — grep it before opening files.

**2. Find the seams.** A seam is a boundary where one piece can be finished and verified without the others being done. Good seams split on **file boundaries**, have a narrow interface, and can be checked alone.

Bad seams: "the backend part" and "the frontend part" when both edit the shared types file. That is one seam wearing a hat.

Prefer a seam that owns one full path end-to-end — a **vertical** slice — over one that owns a
shared layer that every other seam also touches. A vertical seam can be finished and verified
alone; a horizontal one is the "bad seams" example above wearing a different hat.

**3. Per seam, write three things.** No seam ships without all three:

| | |
|---|---|
| **Scope** | file globs, exclusive. Not "auth stuff" — `src/auth/*` |
| **Exit** | what "done" means, checkable by someone else |
| **Verify** | the command or observation that proves it. `npm test auth` → pass, not "looks right" |

**4. Sequence.** Which seams depend on which? Dependencies are almost always *interfaces*: seam B needs the type seam A defines. Land the interface first, then both sides go parallel.

**5. Route each seam to a provider.** Read `## Roster` on the board for what this project actually has, then route in two steps: **capability first, then cost.**

*Capability* — reject, do not degrade:

| Seam needs | Provider must have |
|---|---|
| edits across many files | repo access + a window that holds them |
| running the suite | shell permission |
| root-cause work | the whole call path in context, not one file |
| external calls | network, and credentials it is allowed to use |

Assigning work a provider cannot do produces a confident half-result — worse than a refusal, because you will act on it.

*Cost* — cheapest rung that clears the bar:

| Seam | Route to | Why not higher |
|---|---|---|
| "does X exist", "which callers", "did the test pass" | a command — `rg`, the suite, `git log` | free, exact, cannot hallucinate |
| you already have the context | this turn | a spawn re-derives what you know |
| single-file edit, stub, test from a named behaviour, mechanical rename | cheap tier | no judgment in it |
| multi-file refactor, root cause, ambiguous requirements | strong tier | judgment is what you are paying for |
| many independent mechanical seams | cheap tier fanned out | + one strong joiner at the gate |

Verification routes the same way: the cheapest thing that can prove it.

**6. Write the task files.** Each seam becomes `.agent/tasks/T-NNN-<slug>.md` with `scope`, `exit`, `owner` and `phase: plan` in the frontmatter, and the reasoning under `## Plan`. Add each to the board's task index. Ids are monotonic — check the index for the next one.

A seam that stays in your head dies with your session. If it outlives this turn, it gets a file.

**7. Claim what you are taking** and start. A plan that is not claimed is a plan someone else will duplicate.

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
written: T-007, T-008, T-009. claimed: T-007.
```

## Rules

- **Never plan two owners onto one file.** If the split demands it, the split is wrong — re-cut, or serialize.
- **No seam without a verification.** "Then it works" is not an exit condition.
- **Parallelize only disjoint file sets.** Wall-clock saved is never worth a merge bug.
- **Every parallel fan-out needs a join gate** — one agent, full suite, after the merge, logged.
- **Do not plan past the first unknown.** If seam 2 depends on what seam 1 discovers, plan seam 1 and say so. Speculative seams get thrown away.
- **Cap the depth.** A seam needing its own sub-seams three levels down means the top-level cut was wrong. Back up and re-cut.
- Deliberate shortcuts get a `godkit:` note naming the ceiling.

## Anti-patterns

- **Plan-shaped procrastination** — three seams for two hours of work. Do the work.
- **Phase names as seams** — "design / implement / test" is one seam described three times.
- **The unassigned seam** — no owner means everyone assumes someone else, or two people do it.
- **The unverifiable seam** — if you cannot say how to check it, you cannot say when it is done.

## Boundaries

Planning stops when the seams are written and claimed. Running them is **godkit-execute**; proving them is **godkit-test**.
