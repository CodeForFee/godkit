---
id: T-011
title: give the status vocabulary teeth — godkit verify
owner: unrecorded     # predates the model-id rule; not back-filled
scope: lib/contract.js, bin/godkit.js, hooks/clockout.js, templates/*.md, skills/godkit-{handoff,execute,test,help}/SKILL.md, AGENTS.md, README.md, tests/{contract,cli,hooks}.test.js
exit: `npm test` green, and `godkit verify` reports clean on this repo's own 9 tasks and 17 logs
phase: done
blocked:
created: 2026-08-31T0000Z
---

## Plan

`.agent/tasks/` was write-only. `grep -rn tasks lib/ hooks/ bin/` returned two hits — the path
constant in `lib/paths.js:127` and the mkdir in `bin/godkit.js:93`. Nothing read a task back, and
`hooks/clockout.js` enforced only that a log **file existed**, never what was inside it.

So the rules godkit already states went unenforced: a checkable `exit:`, evidence behind a `done`
claim, a mandatory handoff on `partial`/`blocked` (`godkit-handoff`, and the templates' own
comments). Three of `godkit-review`'s 17 tags — `no-exit`, `no-verify`, `resume-blocked` — named
exactly these failures and could only be found by hand.

Cut on file boundaries: one new module (`lib/contract.js`), one new CLI command, one row in
`doctor`, one narrow condition in the existing Stop hook, one new frontmatter field, and prose in
the four skills that own the vocabulary. No new skill, no new command `.toml`, no dependency, no
hook-manifest change.

## Execute

- `lib/contract.js` — new. `parseFrontmatter`, `section`, `empty`, `checkTask`, `checkLog`,
  `checkAll`, `taskEntries`. Reuses `readContained` / `containedEntries` / `logEntries` from
  `lib/paths.js` for the byte budget and symlink refusal. Findings carry `kind` so callers do not
  string-sniff the label.
- `bin/godkit.js` — `cmdVerify`, its `case`, a `HELP` entry, and a `tasks` row in `cmdDoctor`
  counting `kind === 'task'` findings only.
- `hooks/clockout.js:20-60` — `hasSessionLog` became `sessionLog` (returns the path, not a
  boolean) so the log can be read back. `frontmatterSession` now reuses `parseFrontmatter`
  instead of its own duplicate regex. One added block condition: `status: done` with an empty
  `## Verified`.
- `templates/task.md` — added `blocked:`; `templates/log.md` — its placeholder bodies became
  `<!-- -->` comments, matching `task.md`, so a log left at the template does not pass as evidence.
- `skills/godkit-handoff` — the `blocked:` table and what `godkit verify` checks.
  `skills/godkit-execute` — typed blockers and the same-blocker-twice breaker, which is the rule
  `no-recovery` never had. `skills/godkit-test` — what `verify` reads back, and its limits.
  `skills/godkit-help`, `AGENTS.md`, `README.md` — the command and one section.

## Review

- The check is structural only — present / non-empty / not the template placeholder. A fuzzy
  "is this evidence real" check was deliberately rejected: it misfires forever and teaches agents
  to write around it. Judging evidence stays with `godkit-review`.
- The Stop hook enforces **one** of the six rules, inside the existing `stop_hook_active` and
  `didSessionWork` guards. Everything else `verify` reports stays advisory, so a Stop hook cannot
  become a wall. Revertable on its own.
- `templates/log.md` was the one non-obvious change: its bare `<command>` placeholders would have
  passed the check. Fixing the template beat building a heuristic.

## Test

- `npm test` -> 188 tests, 186 passed, 0 failed, 2 skipped (symlink cases need Windows admin).
- `node bin/godkit.js verify` on this repo -> `tasks: clean.`, exit 0, across 9 real tasks and
  17 real logs. Zero false positives on genuine history is the evidence that the rules are not
  over-tight.
- `node bin/godkit.js doctor` -> `tasks        9, all proven`.
- Constructed failures each caught once: unproven `done` task, empty `exit:`, `owner: unassigned`
  past plan, untyped `blocked`, `partial` log with an empty `## Left / next`.
- `node scripts/sync-rules.js` then `npm test` — pretest passes, so the four generated rule files
  are byte-identical to `AGENTS.md`.

## Handoff

Done, claim released. Two things deliberately left:

- The Stop hook blocks on `no-verify` only. `resume-blocked` on a `partial` log with no handoff is
  equally unambiguous and could join it later — held back to keep the first blast radius small.
- `godkit verify` is not wired into CI. It exits non-zero and is ready for it; adding the step is
  a separate call.
