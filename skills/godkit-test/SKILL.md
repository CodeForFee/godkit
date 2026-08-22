---
name: godkit-test
description: >
  Decide what counts as verified, and write the smallest check that would fail if the logic
  broke. Covers what to test and what not to, how to prove a bug is actually fixed (the symptom
  path AND the sibling callers), what evidence to record in a task file, and why a passing
  return value is not evidence. Use when finishing a seam, when a task reaches its Test phase,
  when deciding whether a change needs a test at all, when a bug fix needs proving, or when the
  user says "test this", "does this work", "prove it", "write a test", "how do we verify",
  "is it actually fixed". Do NOT use to run an existing suite — just run it.
license: MIT
---

# Test

A change is finished when something other than you says so. This skill is about what that something should be.

## The verification ladder

Stop at the first rung that actually proves the claim:

1. **A command that already exists** — the suite, `tsc --noEmit`, the linter, `git diff`. Free, exact, cannot hallucinate. Most claims die here. Find it before inventing one: `package.json` scripts, a `Makefile`, the CI workflow file. Prefer a checked-in wrapper (`./gradlew test`, `make test`) over an assumed default — the project already decided how it wants to be checked.
2. **A one-line assertion** you can run right now — a `node -e`, a REPL call, a `curl`. Enough for a pure function or a shape.
3. **A new test in the existing suite** — when the logic is non-trivial and will be changed again.
4. **A manual observation, recorded** — when nothing automatable can reach it: a rendered state, a real device, a third-party call. Say exactly what you did and what you saw.

Reaching for a model to judge whether a diff looks right is not on this ladder. A model reading a diff is the weakest and most expensive check available; use it only when no command can reach the claim.

## What earns a test

**Write one for:** a branch, a loop, a parser, anything touching money, auth, permissions or data loss, and every bug fix — the test *is* the proof the bug is gone.

**Do not write one for:** a one-line pass-through, a constant, a rename, a type-only change, generated code. A test that cannot fail is a maintenance cost with no payoff.

Scale it to the project. In a repo with no test suite, `godkit-lazy` applies: an `assert`-based self-check in a `__main__` or a tiny `test_x` file beats introducing a framework nobody asked for. In a repo with a suite, use the suite — matching what is there is worth more than your preference.

## Proving a bug is fixed

This is where verification most often goes wrong.

A report names a **symptom**. The fix goes at the **root cause**. So the check has two halves, and skipping the second is how a "fixed" bug comes back on a different path:

1. The reported path now works.
2. **Every sibling caller of the function you changed still works.** Grep the callers — `rg 'isExpired' --type ts` — and check them. If you guarded a shared helper, you just changed behaviour for all of them.

Record both in the task's `## Test` section, and put the **root cause location** in the log and on the board, not the symptom. The next agent needs to know where you actually cut.

## What is not evidence

| Claim | Not evidence | Evidence |
|---|---|---|
| the file changed | the edit tool returned ok | read the lines back, or `git diff` |
| tests pass | "should pass now" | the run, with the count |
| the build works | it compiled before | the build command, with its output |
| the bug is fixed | the symptom path works | symptom path **and** sibling callers |
| delegated work is done | its report says done | you ran its verification yourself |
| nothing else broke | the diff looks small | the full suite after the change |

**Report orthogonal outcomes separately.** "14 pass, 2 skipped, 1 unrelated failure" is three facts. Collapsing them into "tests pass" is the most common way a broken state gets handed forward as a clean one.

## Recording it

In the task file's `## Test` section, and in your log's `## Verified`:

```
- `npm test auth` → 14 pass, 0 fail
- `rg 'isExpired' --type ts` → 4 callers, all covered by the suite above
- manual: login with a `+` in the email → still 500. Not this task — filed B-004.
```

Real commands, real output. **Never write a verification you did not run.** A fabricated check is worse than no check, because it stops anyone else from running the real one.

If you could not verify something, say so plainly and set the task `phase: blocked` with the reason. "Unverified" is a valid, useful state. "Verified" that was not is a trap.

## Rules

- The check must be able to fail. If it passes on broken code, it proves nothing.
- Test the behaviour, not the implementation — a test asserting how something works internally breaks on every refactor and catches no bugs.
- One runnable check for non-trivial logic. No frameworks, no fixtures, no per-function suites unless the project already works that way.
- A flaky check is worse than none: it trains everyone to ignore red. Fix it or delete it.
- Do not add a test to raise a number. Coverage is a symptom, never a goal.

## Output

```
verified: `npm test auth` → 14 pass. callers of isExpired: 4, all covered.
unverified: the `+email` path — needs a running mail service. Filed B-004.
```

## Boundaries

This skill decides what proof is required and writes the check. Running an existing suite needs no skill — run it. Judging whether the code is well written is **godkit-lazy**; judging whether the work was organized well is **godkit-review**.
