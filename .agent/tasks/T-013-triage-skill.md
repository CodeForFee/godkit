---
id: T-013
title: godkit-triage — the GitHub comment plane
owner: unrecorded     # predates the model-id rule; not back-filled
scope: skills/godkit-triage/SKILL.md, commands/godkit-triage.toml, skills/godkit-help/SKILL.md, README.md
exit: `npm test` green, including the one-command-per-skill contract at tests/package.test.js:87
phase: done
blocked:
created: 2026-08-30T1810Z
---

## Plan

godkit had no skill for the GitHub surface. `godkit-git` covers worktrees and commits,
`godkit-review` covers orchestration post-mortems, and neither says anything about turning an
issue or PR scope into posted comments.

I had scoped this out once as "a different surface, ~300 lines of prose to own forever". The user
overrode that — the third time on this project that a low-value call of mine was reversed, and the
prior two were right too.

One skill, one command, no code. Prose plus `gh`, which is a subprocess like the `git` the package
already spawns, so the zero-dependency and no-network constraints hold.

## Execute

- `skills/godkit-triage/SKILL.md` — the comment plane: resolve scope with `gh` instead of asking,
  read the right diff, the posting gate, existing coverage as a posting rule, findings format,
  batch clustering, competing PRs, what lands in `.agent/`, output shape, boundaries.
- `commands/godkit-triage.toml` — required by `tests/package.test.js:87`, which asserts exactly one
  command per skill.
- `skills/godkit-help/SKILL.md`, `README.md` — the skill tables, and both hardcoded skill counts.

The two pieces that carry the most weight:

**The diff base rule.** Reviewing against a stale local `main` shows other people's merges as if
they were the author's work. Fetch the base fresh, diff from `git merge-base`, fetch fork PRs via
`pull/N/head` because their branch does not exist on the base repo, and **re-check the head SHA
immediately before posting** — a review against a diff the PR no longer has is wrong and looks
authoritative at the same time.

**The posting gate.** Confidence and severity are independent. Post only high-confidence AND at
least P2; a low-confidence P1 goes to maintainer notes as a hypothesis, never to a public comment.
"No findings" means none at any severity, not "no P0".

## Review

- Checked against the existing skills for overlap: the Boundaries section routes orchestration
  post-mortems to `godkit-review`, pre-commit decision pressure-testing to `godkit-doubt`, seam
  cutting to `godkit-plan`, and the cost rules for spawning workers to `godkit-lazy`. It claims
  only the comment plane.
- Findings land as `B-NNN` on the board with a root-cause location, so triage feeds the same bug
  ledger every other skill reads rather than inventing a second one.

## Test

- `npm test` -> 188 tests, 186 passed, 0 failed, 2 skipped.
- The contract tests that actually gate a new skill all pass: frontmatter `name` matches the
  directory, a `## Boundaries` section exists, and `commands/` and `skills/` are both 16 —
  `tests/package.test.js:87` fails if those counts diverge.
- `grep -rn "fifteen"` across `README.md`, `skills/` and `AGENTS.md` returns nothing, so no
  hardcoded count was left stale.

## Handoff

Done, claim released. This branch is cut from `main` and does not touch anything in T-012's
`godkit/windows-ci`, so the two merge in either order.
