---
name: godkit-refactor
description: >
  Evolve the source from what .agent/ already knows: which files churn session after session, which
  keep turning up as a bug's root cause, and who depends on them. Ranks hotspots, then reads the
  code to decide whether there is a real change to make. Use on "refactor this", "clean up the
  code", "where is the tech debt", "why do we keep breaking this file", "evolve the code", or after
  the same file is fixed a third time. Do NOT use to write or repair skills in .agent/skills/ —
  that is godkit-evolve, which evolves procedures, not code.
argument-hint: "[path or file]"
license: MIT
---

# Refactor

Every session already writes down which files it held, which it changed, and which one was
actually to blame when something broke. Over sixteen sessions that is a churn-and-blame record
nobody had to author. This skill reads it, then reads the code.

**The ranking is evidence of attention, not of badness.** A file at the top has been worked on
and blamed. Whether that means it should change is a judgment the report cannot make, and you
must not skip.

## Start from the report

```
godkit refactor          # top 15 code files by churn and blame
godkit refactor --all    # the whole ranking
```

| column | means |
|---|---|
| `touched` | sessions whose `scope:` or `## Did` named this file |
| `blamed` | `## Bugs` bullets that named it as a root cause |
| `sessions` | distinct sessions — three edits in one session is one session |
| `fan-in` | files the map says depend on this one |

`score = blamed × 2 + touched`. Blame counts double because a file that was a root cause is
evidence about the code, while a file that was merely touched is often evidence about what
someone happened to be working on that week.

**Read the four columns together, not the score.** They mean different things:

| shape | reading |
|---|---|
| high blamed, low fan-in | a genuinely fragile file. The best candidate there is. |
| high blamed, high fan-in | fragile *and* load-bearing. Fix it, and land the test first. |
| high touched, zero blamed | an active area, not a broken one. Often the newest feature. **Usually leave it.** |
| low everything, high fan-in | quiet and depended on. Not a refactor target — a file to not break. |

A file at the top of the ranking that nothing is wrong with is the expected case. Say so and
stop; that is a finding, not a failure.

## Then read the code

The report names files. It does not know what is in them.

Open the top candidates and look for a cause that explains the blame:

- the same fix applied in three callers, where one guard in the shared function would have done
- a function that grew a new branch every time the file appears in the log
- an invariant enforced at the call sites instead of at the boundary
- two things in one file that change for different reasons, so every change risks the other

If the blame has no such cause — three unrelated bugs that happened to land in one big file —
there is no refactor here. Say that.

Cross-check the map before you propose anything:

```
rg '"summary"' .agent/graph.json | rg -i <the concept>
rg 'function:<path>:<name>' .agent/graph.json    # every caller
```

## Propose before you cut

One line per candidate, in this shape:

> `lib/thing.js` — blamed 3×, fan-in 9. Every caller re-checks the same precondition; B-004 and
> B-007 were both a caller that forgot. Move the check into `thing()`. ~20 lines, 9 call sites.

Then let the user pick. A refactor nobody asked for is the most expensive kind of code, because
it changes working software and the diff is large enough that nobody reads it.

## When you do cut

The protocol is not suspended because the work is a refactor — it is exactly when two agents
collide.

1. **Claim the files on `.agent/BOARD.md` first.** A refactor touches many files; that is what
   the claim is for.
2. **Root cause, not symptom.** Grep every caller of what you are about to change. One guard in
   the shared function is a smaller diff than a guard in every caller, and it leaves no sibling
   caller broken.
3. **A behaviour-preserving change needs a test that would have caught the regression**, written
   *before* the change and passing both before and after. Without it you are not refactoring,
   you are rewriting.
4. **One concern per commit.** A refactor mixed with a fix is a diff nobody can review, and it
   is the reason "we refactored and something broke" has no answer.
5. **Close the loop on the board.** If the refactor fixes the cause behind a `[x]` bug that kept
   coming back, say so at its root-cause location — that is how the next agent tells a fixed bug
   from a recurring one.

## What not to refactor

- Code with no test coverage and no bug history. You would be changing something that, as far as
  the evidence goes, has never been wrong.
- A file that is high `touched` and zero `blamed`. It is being built, not failing.
- Anything to satisfy a metric. `score` is a heuristic over sixteen markdown files, and it is not
  a target.
- Generated files. Fix the generator.

## Boundaries

This skill evolves **source code**. It does not write or repair skills in `.agent/skills/` —
that is **godkit-evolve**, which evolves procedures, and the two are deliberately separate.

It does not decide what work to do next (**godkit-plan**), judge whether work is verified
(**godkit-test**), or diagnose why a multi-agent run went wrong (**godkit-review**). It does not
build or refresh the map it reads (**godkit-map**) — if `godkit refactor` reports no map, run
that first.

It ranks by churn and blame, which is a proxy. It cannot see code that is bad and has never been
touched, and it cannot see a file that is only hot because someone is actively building it.
