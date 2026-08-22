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
| root | `.agent/**` | T-001, T-008 | 2026-08-22T14:04Z | active |
| Singer | install lifecycle files and focused tests | T-005 | 2026-08-22T14:04Z | ready |
| root | CLI/freshness/managed-init files and tests | T-006 | 2026-08-22T14:04Z | blocked on T-005 |
| Kuhn | package/manifests/commands/workflows/docs/contracts | T-007 | 2026-08-22T14:04Z | ready |

One owner per file. Workers update only their task and unique log; root alone edits this board.

## Tasks

| id | title | owner | phase | file |
|---|---|---|---|---|
| T-001 | preflight and map checkpoint | root | done | `.agent/tasks/T-001-preflight.md` |
| T-002 | evolve snapshot and evidence safety | Hooke | done | `.agent/tasks/T-002-evolve-safety.md` |
| T-003 | graph transaction and scan safety | Kuhn | done | `.agent/tasks/T-003-graph-scan.md` |
| T-004 | hook runtime and session isolation | Singer | done | `.agent/tasks/T-004-hook-runtime.md` |
| T-005 | install lifecycle ownership | Singer | plan | `.agent/tasks/T-005-install-lifecycle.md` |
| T-006 | CLI, freshness, and managed init | root | plan | `.agent/tasks/T-006-cli-integration.md` |
| T-007 | package, docs, and release contracts | Kuhn | plan | `.agent/tasks/T-007-package-docs.md` |
| T-008 | join verification and handoff | root | plan | `.agent/tasks/T-008-join-handoff.md` |

## Bugs

- [x] B-001 absolute cross-drive path could enter the graph — fixed at `lib/graph.js` in the prior session.
- [x] B-002 project skill projections can expose unapproved source edits or remove foreign targets — fixed in T-002 (owned SHA-256 snapshots).
- [ ] B-003 partial map refresh can retain deleted nodes/edges and graph writes are not transactional.
- [ ] B-004 freshness and ignore matching can misclassify changes or crash on valid patterns.
- [x] B-005 hook context and brief reads can cross boundaries or exceed bounded budgets — fixed in T-004.
- [ ] B-006 lazy/work state is shared across sessions and clockout evidence is not exact — runtime fixed in T-004; STAYS OPEN until T-005 registers `hooks/work-track.js`, without which nothing records work.
- [ ] B-007 install/uninstall ownership can remove foreign skills/hooks or mutate unsafe config.
- [ ] B-008 init overwrites host files instead of managing an isolated, preflighted block.
- [ ] B-009 host manifests, Gemini commands, package artifacts, and publish gates drift from contract.
- [x] B-010 evolve fixtures leak temporary directories — fixed in T-002. Documentation half moved to T-007.

## Binding decisions

- Node 18+ and zero runtime dependencies remain hard constraints; version stays `1.0.0`.
- `.agent/` remains committed. Generated map files are regenerated, never textually merged.
- `AGENTS.md` is the canonical rule body; host files preserve user text through managed blocks.
- Project skills are approved snapshots, not live links; foreign projections are never adopted silently.
- Codex standalone hooks live in `hooks.json`; plugin hooks require review/trust through `/hooks`.
- This run may commit locally, but may not publish, tag, push, reinstall plugins, or write real home config.
- Each implementation seam lands from an isolated worktree after its targeted test passes.

## Last 3 handoffs

- 2026-08-22T14:58Z claude — T-002 and T-004 joined at `06b7961`: 129 passed, 0 failed, 1 skipped;
  t002/t004 worktrees removed; next T-005 (must register `hooks/work-track.js`) and T-007.
- 2026-08-22T14:29Z Kuhn — T-003 joined at `e8bcf0e`: graph/scan targeted tests 25/25 on branch and root; claim released.
- 2026-08-22T14:17Z root — T-001 done: baseline 97/97; full map 143 nodes/268 edges, current and integrity-clean; next T-002 ∥ T-003 ∥ T-004.

## Open notes

- The map is STALE (20 files, 8 commits behind). Deliberately deferred to T-008 rather than
  rebuilt three times while T-005/T-006/T-007 are still landing.
