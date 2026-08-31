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

## Bugs

- [x] B-001 absolute cross-drive path could enter the graph — fixed at `lib/graph.js` in the prior session.
- [x] B-002 project skill projections can expose unapproved source edits or remove foreign targets — fixed in T-002 (owned SHA-256 snapshots).
- [x] B-003 partial map refresh can retain deleted nodes/edges and graph writes are not transactional — fixed in T-003 (atomic) and T-006 (deleted nodes).
- [x] B-004 freshness and ignore matching can misclassify changes or crash on valid patterns — fixed in T-003 (ignores) and T-006 (fail-closed freshness).
- [x] B-005 hook context and brief reads can cross boundaries or exceed bounded budgets — fixed in T-004.
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

- [ ] B-013 `godkit init` must never be run inside the godkit repo itself: it appends AGENTS.md's
  own body back into AGENTS.md, CLAUDE.md and the cursor rules, because here AGENTS.md is the
  generator source rather than a managed copy. Not a defect in `applyBlock` — appending a marked
  block to a host file with none is what init is for. Open as a documentation gap; this repo's
  `.gitattributes` is hand-maintained and should be edited directly.

## Binding decisions

- Node 18+ and zero runtime dependencies remain hard constraints; version stays `1.0.0`.
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

- 2026-08-30 claude — T-013 done: added `godkit-triage`, the GitHub comment plane (fresh-base
  diffs, the confidence x severity posting gate, batch clustering). Prose + `gh`, no code, no
  dependency. 188 tests / 186 passed / 2 skipped, skills and commands both 16. Claim released.
- 2026-08-31 claude — T-011 done: `godkit verify` reads `.agent/tasks/` and `.agent/log/` back
  against the rules the templates already stated; clockout now blocks a `done` log with an empty
  `## Verified`; tasks gained a typed `blocked:`. 188 tests / 186 passed / 2 skipped, and verify
  is clean on this repo's own 9 tasks and 17 logs. Claim released.
- 2026-08-26T0520Z claude — T-010 done: godkit-refactor split out of godkit-evolve, B-011 map tour
  fixed, release polish. 167 tests / 166 passed / 1 skipped, pack clean at 81 files. Claim released.
- 2026-08-22T16:35Z claude — T-008 join: all eight seams done. 160 passed / 0 failed / 1 skipped,
  publish dry run clean, map rebuilt to 160 nodes / 314 edges and current. All claims released.

## Open notes

- Nothing is claimed. `main` is the only branch now, local and remote, and it is pushed. All the
  merged `godkit/*` branches are deleted.
- The map is current and stamped at the release commit. GitHub topics and homepage are set.
- **The one thing left, and it is one-way:** not published to npm and not tagged. The
  trusted-publisher registration has to exist on npmjs.com first — see the binding decision
  above. `godkit` was free on the registry (404) as of 2026-08-26; unclaimed means claimable by
  anyone, so this is not a decision to sit on indefinitely.
- This machine has 3 of 10 hooks registered from an older install — `godkit hooks install` fixes
  that, and writing real home config is still nobody's mandate.
