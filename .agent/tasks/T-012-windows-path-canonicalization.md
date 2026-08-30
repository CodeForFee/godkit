---
id: T-012
title: one canonicalizer — fix the red Windows CI
owner: claude
scope: lib/paths.js, lib/work.js, lib/install.js, lib/evolve.js, tests/*.test.js
exit: the full suite green with TMP pointed at an 8.3 short path, which reproduces the runner
phase: done
blocked:
created: 2026-08-30T1800Z
---

## Plan

Windows CI had been red since before 2026-08-26 — 8 tests at `851f31f`, spread across evolve,
worktree resolution, work-track and clockout, with no obvious common thread. Ubuntu 18/22/24
passed and the suite passed on the developer's local Windows, so it looked environment-specific
and had been left alone. PR #14 added a 9th red line to the same pile.

First establish it is one cause, not eight. Then reproduce it locally before changing anything —
a fix for a failure you cannot trigger is a guess.

## Execute

**Root cause: two canonicalizers in one codebase.**

`fs.realpathSync` leaves an 8.3 short name (`C:\Users\RUNNER~1\...`) exactly as it found it.
`fs.realpathSync.native` expands it, and so does `git rev-parse --show-toplevel`. `lib/paths.js`
`real()` used `.native`; `lib/install.js:177`, `lib/evolve.js:397` and 13 test fixtures used the
plain form. So the roots were long-form and the fixtures short-form: two spellings of one
directory that compare as different, and `isInside` answered false about a file plainly inside the
project. GitHub's runner user is `runneradmin` (> 8 chars, so `RUNNER~1` exists); the developer's
is `NEO`, which needs no alias — which is exactly why it only ever failed on CI.

- `lib/paths.js` — export `real()` and document why `.native` is load-bearing.
- `lib/install.js`, `lib/evolve.js` — use `real()` instead of their own `fs.realpathSync`.
- `lib/work.js:179` — canonicalize the incoming path too. The roots are canonical, so a host
  handing over a non-canonical path had its edit silently discarded: invisible work, the one thing
  the log exists to prevent. `real()` is null for a path that no longer exists (a delete, an
  apply_patch naming a file not yet written), so the resolved form stays as the fallback.
- 13 test fixtures — `fs.realpathSync.native`, so a fixture path has the shape the library
  actually produces.

## Review

- The library was not wrong about canonical form; it was inconsistent about which function
  produced it. Fixing the fixtures alone would have turned CI green while leaving `work.js` able
  to drop an edit, so both halves landed.
- `lib/paths.js` keeps the plain call inside `real()` as its `.native`-unavailable fallback. That
  is the one legitimate use, and the new invariant test exempts that file by path.

## Test

- Reproduced first: `TMP`/`TEMP` pointed at an 8.3 short path (`os.tmpdir()` honours them) gives
  **exactly the same 9 failures** as the runner, on a local machine that otherwise passes.
- After the fix, under that same 8.3 `TMP`: `node --test` -> 190 tests, 188 passed, 0 failed,
  2 skipped. Under a normal `TMP`: identical.
- `npm test` (with pretest) green.
- Falsification, per godkit-test's "the check must be able to fail": reverting the one line in
  `lib/work.js` turns the new test red (`an edit reaching the repo through a link is still this
  session's work`) and restoring it turns it green.
- New coverage: a junction/symlink reproduces the same non-canonical shape on any platform and
  needs no elevation, so the regression test runs on Linux too rather than only where the original
  bug appeared. A second invariant test fails if any file outside `lib/paths.js` reintroduces plain
  `fs.realpathSync`.

## Handoff

Done, claim released. The 8 pre-existing failures and the 1 from T-011 are all fixed by the same
change. Nothing outstanding on this seam.
