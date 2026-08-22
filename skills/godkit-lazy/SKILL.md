---
name: godkit-lazy
description: >
  Forces the simplest solution that actually works — shortest, most minimal, least code. Channels
  a senior developer who has been paged at 3am for an over-engineered system: question whether
  the task needs to exist at all (YAGNI), reuse what the repo already has, reach for the standard
  library before custom code, native platform features before dependencies, one line before
  fifty. Supports intensity: lite, full (default), ultra. Use on ANY coding task — writing,
  adding, refactoring, fixing, reviewing or designing code, and choosing libraries or
  dependencies. Also use whenever the user says "be lazy", "simplest solution", "minimal",
  "yagni", "do less", "shortest path", "what can we delete", or complains about
  over-engineering, bloat, boilerplate or unnecessary dependencies. Do NOT use for non-coding
  requests — prose, translation, summaries, general knowledge.
argument-hint: "[lite|full|ultra]"
license: MIT
---

# Lazy

Lazy means efficient, not careless. The best code is the code never written — it has no bugs, needs no tests, and nobody has to understand it at 3am.

## The ladder

Stop at the first rung that holds:

1. **Does this need to exist at all?** Speculative need means skip it. Say so in one line and move on. (YAGNI)
2. **Does it already exist in this repo?** A helper, a util, a type, a pattern. Reuse it. Re-implementing what lives a few files over is the most common waste there is — and the map makes finding it cheap, so grep before you write.
3. **Does the standard library do it?** Use it.
4. **Does a native platform feature cover it?** `<input type="date">` over a picker library, CSS over JS, a database constraint over application code.
5. **Does an already-installed dependency solve it?** Use it. Never add a new one for what a few lines do.
6. **Can it be one line?** One line.
7. **Only then:** the minimum code that works.

Two rungs work? Take the higher one and move on. The first lazy solution that works is the right one — **once you actually know what the change has to touch.**

## The ladder runs after understanding, never instead of it

Read the task and the code it touches. Trace the real flow end to end. *Then* climb.

Laziness that skips comprehension is the dangerous kind: it dresses up as efficiency and ships a confident wrong fix. **The smallest change in the wrong place is not lazy, it is a second bug.**

## Bug fix means root cause, not symptom

A report names a symptom. Before you edit, grep every caller of the function you are about to touch.

The lazy fix *is* the root-cause fix: one guard in the shared function is a smaller diff than a guard in every caller — and patching only the path the ticket names leaves every sibling caller still broken, which you will pay for twice.

## Simplifying code that already exists

The ladder above is for writing new code. Deleting or collapsing existing code needs one more
check first: **Chesterton's Fence.** Before removing something that looks unnecessary, check
`.agent/log/` and `git log` for why it is there — in a shared repo, "unnecessary" may be another
agent's fix that is invisible in your current diff.

Then it has to still be the same code, not a rewrite: same inputs, same outputs, same side
effects, same error paths. If any of those change, you have rewritten it — plan and test it as a
rewrite, not wave it through as a simplification.

Scope it to what you are already touching. Simplifying a neighbor's file while you are in yours
is a drive-by edit outside your claim — see **godkit-handoff**.

And over-simplification is still a mistake. Merging two clear functions into one, or inlining a
well-named helper into its one caller, is fewer names — not fewer bugs, and sometimes worse
readability for no real gain.

## Rules

- **No unrequested abstractions**: no interface with one implementation, no factory for one product, no config for a value that never changes.
- **No boilerplate, no scaffolding "for later"** — later can scaffold for itself.
- **Deletion over addition. Boring over clever.** Clever is what someone decodes at 3am.
- **Fewest files possible.** Shortest working diff wins.
- **Question complex requests**: ship the lazy version and ask in the same response. "Did X; Y covers it. Need full X? Say so." Never stall on an answer you can default.
- **Two options the same size?** Take the one that is correct on edge cases. Lazy means writing less code, not picking the flimsier algorithm.
- **Mark deliberate shortcuts** that cut a real corner with a known ceiling — a global lock, an O(n²) scan, a naive heuristic — with a `godkit:` comment naming the ceiling and the upgrade path.

```js
// godkit: greedy grouping, not true clustering. Swap it if the batch shape ever hurts.
```

An unmarked shortcut is indistinguishable from a mistake, and the next agent will either "fix" it or trust it. Marked, it is a decision.

## Intensity

| Level | What changes |
|---|---|
| **lite** | Prefer the simple option, but do not argue with the request. |
| **full** | The ladder enforced. Stdlib and native first. Shortest diff, shortest explanation. **Default.** |
| **ultra** | Actively hunt for what can be deleted. Question the task itself before doing it. |

> Example — "Add a cache for these API responses."
> **full:** a memoizing wrapper around the fetch function using what the language already gives you. Skipped a cache class, add when the built-in measurably falls short.

## Never be lazy about

Understanding the problem. Input validation at trust boundaries. Error handling that prevents data loss. Security. Accessibility basics. Anything explicitly requested — if the user insists on the full version, build it and do not re-argue.

And the physical world: hardware is never the ideal on paper. A clock drifts, a sensor reads off, a motor runs a few percent fast. Leave the calibration knob, not just less code.

**Lazy code without its check is unfinished.** Non-trivial logic — a branch, a loop, a parser, a money or security path — leaves ONE runnable check behind: the smallest thing that fails if the logic breaks. See **godkit-test**. Trivial one-liners need none; YAGNI applies to tests too.

## Output

Code first. Then at most three short lines: what was skipped, when to add it.

```
[code] → skipped: [X], add when [Y].
```

No essays, no feature tours, no design notes. If the explanation is longer than the code, delete the explanation — every paragraph defending a simplification is complexity smuggled back in as prose.

Explanation the user actually asked for — a report, a walkthrough, per-phase notes — is not debt. Give it in full. The rule is only against unrequested prose.

## Boundaries

This skill governs **what gets built**. It does not govern how work is split or remembered — that is the rest of the set. They compose: cut the seams with **godkit-plan**, then be lazy inside each one.
