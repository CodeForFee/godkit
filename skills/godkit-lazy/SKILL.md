---
name: godkit-lazy
description: >
  Fewest turns to the smallest change that works. Two ladders: what already answers the question
  (the map, a command, this turn) before spending a model; then YAGNI, reuse, stdlib, native, one
  line, before writing anything new. Levels: lite, full (default), ultra. Use on ANY coding task,
  and whenever the user says "be lazy", "simplest solution", "minimal", "yagni", "do less",
  "shortest path", "what can we delete", "make it faster", or complains about over-engineering,
  bloat, boilerplate or wasted tokens. Do NOT use for non-coding requests.
argument-hint: "[lite|full|ultra|off]"
license: MIT
---

# Lazy

Two things cost you: code you did not need to write, and turns you did not need to take. Most
guidance fixes only the first. Fourteen tool calls to produce three lines is not fast, it is slow
with a small diff.

Default **full**. `/godkit-lazy lite|full|ultra|off`; add `default` to persist.

## Ladder one — fewest turns

Runs first: it decides what you pay to learn what to build.

1. **Already written down?** `.agent/MAP.md` describes this architecture, `BOARD.md` says which
   bugs are fixed and what was decided. Re-deriving that from source is the most expensive habit in
   agent work, and it looks like diligence.
2. **Can a command answer it?** `rg`, the test suite, `tsc --noEmit`, `git log`. Free, cannot
   hallucinate, and it is the verification anyway.
3. **Read once, wide.** Every file you know you need, one parallel batch. Thinking between
   independent reads buys nothing.
4. **Edit, do not rewrite.** Rewriting a file to change one line bills you for everything unchanged.
5. **Verify once, at the end.** The exit condition is the check.
6. **No plan document for work that fits in this turn.**

## Ladder two — least code

Stop at the first rung that holds:

1. **Does this need to exist at all?** Speculative = skip it, say so in one line. (YAGNI)
2. **Already in this repo?** A helper, util, type or pattern → reuse it. Grep before you write;
   re-implementing what sits a few files over is the most common waste.
3. **Stdlib does it?** Use it.
4. **Native feature covers it?** `<input type="date">` over a picker lib, CSS over JS, a DB
   constraint over app code.
5. **Installed dependency solves it?** Use it. Never add one for what a few lines do.
6. **One line?** One line.
7. **Only then:** the minimum code that works.

Two rungs work → take the higher one and move on.

**Both ladders run after you understand the problem, never instead of it.** Trace the real flow end
to end first. The smallest change in the wrong place is not lazy, it is a second bug wearing the
costume of efficiency.

**Bug fix = root cause.** A report names a symptom. Grep every caller before you edit: one guard in
the shared function is a smaller diff than a guard in each caller, and patching only the path the
ticket names leaves every sibling broken.

## Throughput

- **Five files needing the same mechanical change is one pass, not five delegations.** Delegation
  costs a cold start; it earns that back only when the seams genuinely differ.
- **Disjoint seams go out as one wave, not one after another** — see the sprint section of
  **godkit**. Serialising what could run at once is the largest wall-clock waste there is.
- **Report orthogonal outcomes separately.** "Tests pass but I skipped the migration" is two facts;
  collapsing them into "done" hands the next agent a trap.

## Rules

- No unrequested abstractions: no interface with one implementation, no factory for one product, no
  config for a value that never changes. No scaffolding "for later" — later can scaffold itself.
- Deletion over addition. Boring over clever; clever is what someone decodes at 3am.
- Complex request? Ship the lazy version and question it in the same response: "Did X; Y covers it.
  Need full X? Say so." Never stall on an answer you can default.
- Two options the same size? Take the one correct on edge cases. Lazy is less code, not a flimsier
  algorithm.
- Mark a shortcut with a real ceiling: `// godkit: greedy grouping, not clustering. Swap if batch
  shape hurts.` Unmarked, it is indistinguishable from a mistake.
- **Deleting existing code needs Chesterton's Fence:** check `.agent/log/` and `git log` for why it
  is there — "unnecessary" is often another agent's fix, invisible in your diff. Same inputs,
  outputs, side effects and error paths, or it is a rewrite. Stay inside your claim.

## Levels

| | code | turns |
|---|---|---|
| **lite** | prefer the simple option, don't argue | ladder one still applies |
| **full** | ladder two enforced, stdlib and native first | both ladders, shortest diff and explanation |
| **ultra** | hunt for what to delete, question the task | answer from the map or a command, or say why you can't |
| **off** | ordinary judgment | — |

## Never be lazy about

Understanding the problem. Input validation at trust boundaries. Error handling that prevents data
loss. Security. Accessibility. Anything explicitly requested — user insists on the full version,
build it, no re-arguing. And hardware: a clock drifts, a sensor reads off. Leave the calibration
knob, not just less code.

**Lazy code without its check is unfinished.** Non-trivial logic — a branch, a loop, a parser, a
money or security path — leaves ONE runnable check behind, the smallest thing that fails if the
logic breaks. See **godkit-test**. Trivial one-liners need none; YAGNI applies to tests too.

## Output

Code first, then at most three short lines. `[code] → skipped: [X], add when [Y].`

If the explanation is longer than the code, delete the explanation — every paragraph defending a
simplification is complexity smuggled back as prose. Explanation the user asked for is not debt.

## Boundaries

Governs what gets built and how many turns it takes. Not how work is split or remembered: seams
with **godkit-plan**, waves with **godkit**, then be lazy inside each one.
