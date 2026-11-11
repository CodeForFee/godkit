# Board — godkit

Current truth only. Detailed history lives in Git and `.agent/log/`.

## Roster

| provider | can | use for |
|---|---|---|
| root | coordinate, integrate, verify | BOARD, CLI join, final gate |
| Hooke | core runtime | evolve safety |
| Kuhn | graph and product surface | graph/scan, then package/docs |
| Singer | hook runtime | sessions, hooks, installer lifecycle |

## Now (claims)

| agent | scope (file globs) | task | since (UTC) | status |
|---|---|---|---|---|
| — | nothing claimed | — | — | the whole repo is free |




One owner per file. Workers update only their task and unique log; root alone edits this board.

## Tasks

| id | title | owner | phase | file |
|---|---|---|---|---|
| T-001 | preflight and map checkpoint | root | done | `.agent/tasks/T-001-preflight.md` |
| T-002 | evolve snapshot and evidence safety | Hooke | done | `.agent/tasks/T-002-evolve-safety.md` |
| T-003 | graph transaction and scan safety | Kuhn | done | `.agent/tasks/T-003-graph-scan.md` |
| T-004 | hook runtime and session isolation | Singer | done | `.agent/tasks/T-004-hook-runtime.md` |
| T-005 | install lifecycle ownership | claude | done | `.agent/tasks/T-005-install-lifecycle.md` |
| T-006 | CLI, freshness, and managed init | claude | done | `.agent/tasks/T-006-cli-integration.md` |
| T-007 | package, docs, and release contracts | claude | done | `.agent/tasks/T-007-package-docs.md` |
| T-008 | join verification and handoff | claude | done | `.agent/tasks/T-008-join-handoff.md` |
| T-010 | public release prep and the refactor seam | claude | done | `.agent/tasks/T-010-release-refactor.md` |
| T-011 | give the status vocabulary teeth — `godkit verify` | claude | done | `.agent/tasks/T-011-task-contract.md` |
| T-014 | templates audit — one source per fact | claude | done | `.agent/tasks/T-014-templates-audit.md` |
| T-015 | v1.1: one-command install, greenfield, sprint, model identity, lazy rewrite | claude-opus-5 | done | `.agent/tasks/T-015-v11-product.md` |
| T-016 | native session teams, role skills and concise peer coordination | gpt-6 | done | `.agent/tasks/T-016-native-team.md` |
| T-017 | portable runtime, verified onboarding and release recovery | gpt-6.1-sol | done | `.agent/tasks/T-017-portable-install.md` |
| T-018 | native Antigravity roles, skill discovery and readiness | gpt-6.1-sol | done | `.agent/tasks/T-018-antigravity-native.md` |

## Bugs

- [x] B-018 POSIX bootstrap accepted path-bearing lock values and imprecise private runtime reuse; scripts/install.sh:59/82 now use strict version/archive checks, exact pin and atomic cache lock. tests/bootstrap.test.js covers traversal, damaged reuse and concurrent installs; T-018 follow-up to T-017.


- [x] B-006 lazy/work state is shared across sessions and clockout evidence is not exact — runtime fixed in T-004, work-track registered in T-005.
- [x] B-007 install/uninstall ownership can remove foreign skills/hooks or mutate unsafe config — fixed in T-005; `link()` in `bin/godkit.js` is the last unguarded delete, owned by T-006.
- [x] B-008 init overwrites host files instead of managing an isolated, preflighted block — fixed in T-006 (`lib/managed.js`).
- [x] B-009 host manifests, Gemini commands, package artifacts, and publish gates drift from contract — fixed in T-007.
- [x] B-010 evolve fixtures leak temporary directories — fixed in T-002; documentation half fixed in T-007.
- [x] B-011 the committed map's start-here tour is eight empty entries, so `.agent/MAP.md` renders
  `1. **** — ` in the public repo. Root cause is the tour data in `.agent/graph.json`, not
  `renderMap` in `lib/graph.js` — the architect pass emitted `title: ""` and `nodeIds: []` and
  nothing downstream refuses an empty tour. Tour rewritten in T-010; `renderMap` left alone.
- [x] B-012 Windows CI red since before 2026-08-26 (8 tests) — root cause was two canonicalizers:
  plain `fs.realpathSync` leaves an 8.3 short name alone while `.native` and git both expand it,
  so roots and fixtures were two spellings of one directory that compared as different. Fixed in
  T-012 at `lib/paths.js` (one exported `real()`), not in the individual failing tests. Only
  reachable when a path component has an 8.3 alias, which is why the runner failed and local
  never did.

- [x] B-014 `godkit init` rewrote `~/.claude/settings.json` on every call once init started doing
  the machine half, so parallel test files raced on one rename and Windows returned EPERM. Root
  cause was `writeSettings` in `lib/install.js`, which wrote unconditionally even when the new body
  was byte-identical to the old — not the tests, and not the new init behaviour on its own. Fixed
  at `lib/install.js:206` (no-op when unchanged) plus `machineReady()` in `bin/godkit.js`, so init
  only touches home config when something is actually missing.
- [x] B-015 `lib/sprint.js` read `T-NNN` ids out of HTML comments, so the shipped sprint template's
  worked example reported two tasks nobody wrote as missing on every fresh sprint. Root cause was
  the extraction regex running over the raw text; fixed by stripping comments first.

- [x] B-016 every reveal animation on the landing page was a 0 -> 0 tween. Root cause was
  `gsap.set(HIDDEN, {opacity: 0})` running before the timelines were built, so each
  `.from({opacity: 0})` recorded 0 as its end value as well. Only elements matching `HIDDEN` were
  ever restored, and only by the 2.6s safety net; their children (`.stats li`, `.actions > *`)
  stayed invisible for good. A `.from()` hides its own target via `immediateRender`, so the pre-set
  is deleted, not reordered. Fixed at `site/src/main.ts`; predates the Vite port.

- [x] B-013 init in the Godkit source duplicated generator rules; blocked before writes by sourceRepository in bin/godkit.js:148. Regression: tests/init-runtime.test.js; T-017.

## Binding decisions

- Portable setup reuses supported system Node or a checksum-pinned private Node24 runtime. Configured assets are distinct from observed host evidence; journaled release rollback never overwrites unowned/concurrent changes. T-017.

- Node 18+ and zero runtime dependencies remain hard constraints; version stays `1.0.0` until the
  first actual publish — there is no released version to move away from.
- **An agent is identified by its MODEL, never its tool.** `claude-opus-5`, not `claude`. One tool
  runs many models with different costs and failure modes, and the next agent reading an unproven
  claim needs to know which one made it. Enforced by `godkit verify` (`no-identity`), stated in
  `AGENTS.md` so every host repeats it. Deliberately NOT a shipped registry of known ids: an
  allowlist is wrong within a quarter and then rejects the truth. `unrecorded` is the one honest
  value, for entries written before the rule; back-filling a guess would fabricate attribution.
- **`init` does the machine half only when the machine is not already set up.** It is run once per
  project and re-run freely; rewriting home config every time is churn, and on Windows an EPERM as
  soon as two land together. Tests never run the machine half at all.
- The CLI owns only what a machine can decide. `sprint new` makes the file and `sprint close`
  checks the tasks; cutting the waves stays with the model, exactly as `scan`/`save` splits from
  `godkit-map`.
- `.agent/` remains committed. Generated map files are regenerated, never textually merged.
- `AGENTS.md` is the canonical rule body; host files preserve user text through managed blocks.
- Project skills are approved snapshots, not live links; foreign projections are never adopted silently.
- Codex standalone hooks live in `hooks.json`; plugin hooks require review/trust through `/hooks`.
- Each implementation seam lands from an isolated worktree after its targeted test passes.
- `godkit-evolve` evolves procedures into `.agent/skills/`; `godkit-refactor` evolves source code.
  Same log stream, different unit. Neither may take over the other's job — that split is the
  entire reason both exist, and merging them re-creates the confusion that caused T-010.
- Docs are excluded from the hotspot ranking. A README outranks every source file on churn and
  there is no refactor at the end of that row.
- **The landing page is plain Vite + TypeScript, no framework and no client JS** (`site/`, ported
  2026-09-05 from SvelteKit). Markup is literal HTML in `index.html`, `src/main.ts` only imports
  the stylesheet, and GSAP is gone — 118.64 kB of client JS became 0.71 kB. Build stays
  `outDir: build` for `vercel.json`; the site's package manager is **pnpm**.
- **Site motion is CSS-only, always-on, and never gates content.** Scroll-triggered reveals are
  banned here: they hid the page whenever a trigger measured wrong, and they made the reader work
  for the animation. Loops run from first paint and `prefers-reduced-motion` turns all of them off.
- **The site is light-themed** (`--bg: #f7f5f1`), with the accent darkened to `#b4530b` so it holds
  contrast on paper; terminal blocks stay dark by re-declaring the tokens inside `.win`.
- The publish gate is npm trusted publishing (OIDC). npmjs.com must carry `CodeForFee/godkit` +
  `publish.yml` as a trusted publisher BEFORE any `v1.0.0` tag is pushed.
- `godkit verify` is **structural only** — present, non-empty, not the template placeholder. It
  never judges whether evidence is good; that stays with `godkit-review`. A fuzzy check would
  misfire forever and train agents to write around it, which is worse than no check.
- **`templates/task.md` and `templates/log.md` are the single source** for the two formats.
  `godkit-handoff`'s inline blocks are generated by `scripts/sync-templates.js` between named
  markers, checked in `npm run check`. Only the frontmatter is generated; the worked body examples
  stay hand-owned, because a blank form teaches less than a filled one.
- The Stop hook enforces exactly one contract rule (`no-verify` on a `done` log). The other five
  stay advisory. A Stop hook that blocks on everything becomes a wall, and the anti-loop guard is
  the only thing standing between that and a stuck turn.

## Last 3 handoffs

- 2026-11-11 gpt-6.1-sol: T-018 AGY native role/schema/skills/readiness; parallel workers; 376 pass,2 skipped,0 failed. Six native roles +16 skills synchronized; actual AGY native execution still host-session pending. B-018 installer validation fixed. Log: log/2026-11-11T0054Z-gpt-6-1-sol-01a1c5f1.md.

- 2026-11-11 gpt-6.1-sol: T-017 portable runtime/install, journaled release recovery, truthful readiness, type/CI/artifact gates. 364 passed, 2 skipped, 0 failed; 220KB npm payload. Optional fresh-runtime recheck blocked by policy; no publish. Log: log/2026-11-11T0017Z-gpt-6-1-sol-01a1c5f1.md.

- 2026-11-10 gpt-6: T-016 native session teams, scoped role skills, peer messages; 51/51 tests, package checks and six TOML definitions valid. Peer question/reply verified; IDE role discovery and token savings unmeasured. Log: log/2026-11-10T1506Z-gpt-6-01a1c5f1.md.

## Open notes

- Nothing is claimed. `main` is the only branch now, local and remote, and it is pushed. All the
  merged `godkit/*` branches are deleted.
- The map is current and stamped at the release commit. GitHub topics and homepage are set.
- **Published.** `@codeforfee/godkit@1.0.0` is live, tagged `v1.0.0` at e420478, verified by
  installing it from the registry into a clean directory and scaffolding a project with it.
  The bare name `godkit` is permanently unpublishable: npm refuses it as too similar to the
  existing `god-kit`. That is why the package is scoped and the plugin manifests are not.
  The first publish was manual, from a logged-in machine, because **trusted publishing cannot
  bootstrap a package that does not exist yet** — npm has nothing to attach the publisher to.
  Register `CodeForFee/godkit` + `publish.yml` as the trusted publisher now that it exists, and
  every version from 1.0.1 on goes out through the tag workflow with provenance.
- This machine has 3 of 10 hooks registered from an older install — `godkit hooks install` fixes
  that, and writing real home config is still nobody's mandate.
