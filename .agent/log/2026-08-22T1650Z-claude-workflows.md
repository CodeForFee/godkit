---
agent: "unrecorded"   # predates the model-id rule; not back-filled
session: workflows-audit
started: 2026-08-22T16:45:00Z
ended: 2026-08-22T16:55:00Z
scope: .github/workflows/test.yml, .github/workflows/publish.yml
status: done
skills: godkit-lazy
---

## Task

Audit and correct the two GitHub Actions workflows.

## Did

- Added `permissions: contents: read` to test.yml. Without the block a job inherits the repository
  default token, which on older repos is read-write — a test job never needs that.
- Added `concurrency` to both, with opposite settings on purpose: test cancels a superseded run
  (six jobs is not worth burning on a stale commit), publish never cancels (interrupting a release
  half way is worse than running two in order).
- Added `timeout-minutes` (10 test / 15 publish). The suite runs in under a minute; the failure
  this guards is a hung hook waiting on stdin, which would otherwise sit for six hours per job.
- Added `npm pack --dry-run` to the publish gate — the one check the suite cannot do for itself.

## Verified

- Every workflow step run locally: three check scripts exit 0, `node --test` -> 160 passed,
  0 failed, 1 skipped, `npm pack --dry-run` exit 0.
- Both files: no tabs, no CRLF, even indentation, required top-level keys present.

## Bugs

- None found in the workflow logic itself; the three changes are hardening, not fixes.

## Decisions

- Left `node --test` bare rather than `node --test tests/`. Directory arguments are well
  documented from Node 20 on and the matrix still covers Node 18; a CI-only regression is not
  worth the tidier invocation.
- Left the triggers alone. `push: [main]` plus `pull_request` is what stops a branch with an open
  PR from running the whole matrix twice per push; feature branches are covered through the PR.
- Left `actions/checkout@v4` and `setup-node@v4`. Both are supported; bumping majors is a change
  with a failure mode and no benefit here.

## Left / next

- Nothing. Workflows are the last thing that changed on `godkit/skill-evidence`.
