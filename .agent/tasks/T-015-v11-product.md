---
id: T-015
title: v1.1 — one-command install, greenfield mode, sprint mode, model identity, lazy rewrite
owner: claude-opus-5
scope: bin/godkit.js lib/sprint.js lib/identity.js lib/paths.js lib/contract.js templates/** skills/** hooks/brief.js hooks/clockout.js AGENTS.md README.md package.json tests/**
exit: npm run check && node --test
phase: done
created: 2026-09-05T0000Z
---

## Plan

Six seams, all in this session, all owned by one agent — nothing here is file-disjoint enough to
parallelise (`bin/godkit.js` is touched by three of them).

1. **Distribution** — `godkit --version`, `godkit init` installs skills + hooks unless
   `--no-install`, README down to one command.
2. **Greenfield** — `godkit init --new` writes `.agent/BRIEF.md`, skips the map path; `doctor`
   reports `greenfield` instead of `missing`.
3. **Sprint** — `lib/sprint.js` + `godkit sprint [new|close]`, `.agent/sprints/S-NNN.md`, one
   section in `skills/godkit/SKILL.md`. No 17th skill.
4. **Model identity** — `lib/identity.js`, a `no-identity` contract tag, and the always-on rule in
   `AGENTS.md` that makes each model declare its own id rather than its tool.
5. **godkit-lazy rewrite** — add the speed ladder and throughput rules, cut the file below 5.5KB.
   `lib/lazy.js` injects this whole body into every session AND every subagent, so its length is a
   per-session bill, not a per-trigger one.
6. **Description trim** — the remaining 15 `description:` blocks.

## Execute

- `godkit --version` / `-v`, and the version on doctor's first line — `bin/godkit.js:645`, `bin/godkit.js:35`
- `init` runs the machine half only when `machineReady()` is false — `bin/godkit.js:47-77`, `--no-install` opts out
- `init --new` writes `.agent/BRIEF.md` and points at the sprint instead of the map — `bin/godkit.js:117`, `templates/BRIEF.md`
- doctor calls an unmapped greenfield repo `greenfield`, not `missing` — `bin/godkit.js:571-579`
- `lib/sprint.js` + `godkit sprint [new|close]`, `.agent/sprints/S-NNN.md` — reuses `lib/contract.checkTask`, adds no second frontmatter parser
- `lib/identity.js` + a `no-identity` finding on `agent:` and `owner:` — `lib/contract.js:74-77`, `lib/contract.js:106-108`
- the model-declaration rule in `AGENTS.md:20-26`, synced to four host files; `hooks/brief.js:19` reminder; `hooks/clockout.js:72` placeholder
- `godkit-lazy` rewritten: a speed ladder before the build ladder, throughput rules, a two-axis level table
- 15 remaining `description:` blocks trimmed

## Review

Two real defects were found while testing, both mine, both fixed at the source rather than worked around:

- `init`'s auto-install rewrote `~/.claude/settings.json` on every call. Parallel test files raced on
  that rename and Windows returned EPERM. Root cause was not the tests: `writeSettings` wrote
  unconditionally even when the content was byte-identical (`lib/install.js:206`), and `init` had no
  reason to touch a machine that was already set up. Both fixed; the tests then also had to stop
  installing machine-wide, because a project-scaffolding test writing to the real `$HOME` is wrong
  regardless of the race.
- `lib/sprint.js` read task ids out of HTML comments, so the shipped template's worked example wave
  table reported `T-001`/`T-002` as missing tasks on every fresh sprint. Fixed by stripping comments
  before extraction, pinned by a test that feeds the real template through.

## Test

- `npm run check` → rule copies, hook manifest, template blocks, versions all in sync
- `node --test` → 211 tests, 209 passed, 0 failed, 2 skipped. Run twice in parallel, both green;
  before the `writeSettings` fix, parallel runs failed non-deterministically 3 runs out of 4.
- `node bin/godkit.js verify` → `tasks: clean.` on this repo's own 15 tasks and 21 logs
- `npm pack --dry-run` → 88 files; `lib/sprint.js`, `lib/identity.js`, `templates/BRIEF.md` and
  `templates/sprint.md` all present, so nothing new 404s for an installed user
- end-to-end in a temp repo outside this one: `init --new` wrote the brief, doctor reported
  `map  greenfield`, `sprint new` opened S-001, and `sprint close` refused with exit 1
- `skills/godkit-lazy/SKILL.md` 7750 -> 5989 bytes; injected body 7047 -> 5120 chars per session
  and per subagent

## Handoff

Done. Two things deliberately left:

- **The map is STALE** — 34 files changed. Rebuilding it is the `godkit-map` skill's multi-batch
  analysis pass, a separate seam, and it was not in this task's scope.
- **Not published.** Still one-way and still gated on registering `CodeForFee/godkit` +
  `publish.yml` as a trusted publisher on npmjs.com before any tag is pushed. Version stayed at
  `1.0.0` on purpose: nothing has ever been published, so there is no released version to move away
  from, and bumping four manifests before a first release is churn.

