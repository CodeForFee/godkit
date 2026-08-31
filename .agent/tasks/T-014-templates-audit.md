---
id: T-014
title: templates audit — one source per fact, nothing orphaned
owner: claude
scope: scripts/sync-templates.js, templates/*, skills/godkit-handoff/SKILL.md, package.json, .gitattributes, tests/{cli,package}.test.js
exit: `npm test` green, and `sync-templates.js --check` exits non-zero on a drifted template
phase: done
blocked:
created: 2026-08-30T1830Z
---

## Plan

Audit every file in `templates/` against its consumer. Six are cleanly read by `cmdInit`
(`BOARD.md`, `THREAD.md`, `MAP.md`, `.agentignore` through `tpl()`; `gitattributes` raw;
`rules/cursor-header.md` by both `cmdInit` and `scripts/sync-rules.js`).

`task.md` and `log.md` are read by no production code — `grep -rn "task\.md|log\.md"` hits only
two test files and `.agent/` map data, and no skill, README line or `AGENTS.md` sentence mentions
`templates/` at all. Agents learn both formats from `godkit-handoff`'s inline copies instead, and
those copies had **already drifted**: `exit` sat between `scope` and `phase` in the template and
after `blocked` in the skill.

That is the one fact in the repo still maintained by hand in two places, against the README's own
Design line — *"One source of truth per fact."* `AGENTS.md` → 4 rule files and `lib/install.js`
HOOKS → `godkit-hooks.json` already work by generation with `--check` in `npm run check`.

## Execute

- `scripts/sync-templates.js` — new, mirroring `sync-rules.js` exactly: no flag regenerates,
  `--check` fails on drift with the same message shape and exit code. Injects each template's
  frontmatter into `skills/godkit-handoff/SKILL.md` between named markers
  (`<!-- godkit:task-frontmatter -->`, `<!-- godkit:log-frontmatter -->`).
  Deliberately not `lib/managed.js`: its `locate()` refuses more than one marker pair per file
  because it guards files a user co-owns, and this file needs two.
- `package.json` — `sync-templates --check` added to the `check` chain, so `pretest` runs it.
- `templates/task.md`, `templates/log.md` — dead placeholders (`{{ID}}`, `{{TITLE}}`, `{{AGENT}}`,
  `{{SESSION}}`, `{{STARTED}}`, `{{SCOPE}}`, `{{UTC}}`) replaced with blanks plus a comment naming
  the expected shape. `tpl()` only ever substitutes `PROJECT` and `UTC`, and only for the four init
  templates, so those placeholders were copied out literally — and `id: {{ID}}` passes
  `godkit verify`, because it is non-empty.
- `skills/godkit-handoff/SKILL.md` — markers around both frontmatter blocks; each generated blank
  form is followed by a hand-owned filled example, so the skill still teaches by example.
- `templates/gitattributes` and this repo's `.gitattributes` — `.agent/SKILLS.md -merge`.
  `godkit evolve --write` generates it (`bin/godkit.js:458`) and it appeared in neither of the
  file's two lists.
- `tests/cli.test.js` — the init test now asserts all four scaffold files plus `tasks/` and `log/`
  land, that the project name was substituted, and that every generated `.agent/` file is marked.
  A second test asserts **no file under `.agent/` contains `{{` after init** — the general guard,
  so a future template that adds a third variable cannot ship it raw.
- `tests/package.test.js` — asserts the skill's blocks contain the templates' frontmatter verbatim,
  so the contract holds even when the suite runs without `pretest`.

## Review

- Left alone deliberately: `templates/.agentignore` overlapping `ALWAYS_SKIP` (`lib/scan.js:26`) is
  layering, not duplication — the floor applies before `.agentignore` is read and cannot express
  globs. Two frontmatter parsers (`evolve.frontmatter`, `contract.parseFrontmatter`) have genuinely
  different contracts. `.agent/THREAD.md.bak` is untracked and already matched by `.gitignore:3`.
- Only frontmatter is generated. Generating the bodies too would have replaced the log's worked
  example (real `## Did` / `## Verified` bullets) with a blank form, which teaches less.

## Test

- `npm test` -> 190 tests, 188 passed, 0 failed, 2 skipped.
- Drift is detectable, per godkit-test's rule that a check must be able to fail: renaming `owner:`
  to `holder:` in `templates/task.md` makes `sync-templates.js --check` exit 1, `npm run check`
  exit 1, and `npm test` exit 1 through `pretest`. Restoring the file returns all three to 0.
- End to end in a scratch repo: `godkit init` lands `BOARD.md`, `THREAD.md`, `MAP.md`,
  `.agentignore`, `tasks/`, `log/`; `grep -rn "{{" .agent/` is empty; `.gitattributes` carries
  `.agent/SKILLS.md -merge`; `BOARD.md`/`THREAD.md` both read `— ta`, the scratch project's name.

## Handoff

Done, claim released. One trap recorded as B-013 below: `godkit init` must never be run inside the
godkit repo itself.
