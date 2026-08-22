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

## Binding decisions

- Node 18+ and zero runtime dependencies remain hard constraints; version stays `1.0.0`.
- `.agent/` remains committed. Generated map files are regenerated, never textually merged.
- `AGENTS.md` is the canonical rule body; host files preserve user text through managed blocks.
- Project skills are approved snapshots, not live links; foreign projections are never adopted silently.
- Codex standalone hooks live in `hooks.json`; plugin hooks require review/trust through `/hooks`.
- This run may commit locally, but may not publish, tag, push, reinstall plugins, or write real home config.
- Each implementation seam lands from an isolated worktree after its targeted test passes.

## Last 3 handoffs

- 2026-08-22T16:35Z claude — T-008 join: all eight seams done. 160 passed / 0 failed / 1 skipped,
  publish dry run clean, map rebuilt to 160 nodes / 314 edges and current. All claims released.
- 2026-08-22T16:12Z claude — T-007 done: shipped what init reads, tag-only publish, docs corrected.
- 2026-08-22T15:50Z claude — T-006 done: managed init blocks, fail-closed freshness, hook commands.

## Open notes

- Nothing is claimed. The remediation branch is `godkit/skill-evidence`.
- Deliberately NOT done, and the next agent's call: not published to npm, not tagged, not pushed,
  and not installed into this machine's real home config. This machine has 3 of 10 hooks
  registered from an older install — `godkit hooks install` fixes that.
