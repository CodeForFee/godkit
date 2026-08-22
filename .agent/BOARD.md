# Board — godkit

One screen. Current truth. Rewritten often. Read this before you edit anything.

## Roster

| provider | can | cost | use for |
|---|---|---|---|
| claude-code | repo-wide, shell, plan | high | root cause, multi-file refactor, cutting seams |
| cursor | open files, shell | low | single-file edits, tests, stubs |
| codex | repo, shell | low | mechanical passes, scripted repeats |
| antigravity | repo, browser | low | verification against a running app |
| commands | `npm test`, `node scripts/*.js`, rg | free | every "does X / did it pass" question |

Route by capability first, then cheapest.

## Now (claims)

| agent | scope (file globs) | task | since (UTC) | status |
|---|---|---|---|---|

One owner per file. If your scope overlaps an open row, do not edit — see AGENTS.md.

## Tasks

| id | title | owner | phase | file |
|---|---|---|---|---|

## Bugs

<!-- B-NNN monotonic, never reused. Fixed bugs stay listed with their root-cause location. -->

- [x] B-001 a path on a different drive leaked in full into the committed graph — fixed 2026-08-22 claude, root cause `sanitizePath` lib/graph.js:96: on Windows `path.relative` across drives returns an absolute path, which passed the bare `..` check (log 2026-08-22T0245Z-claude)

## Decisions

- 2026-08-22 `.agent/` stays the directory name rather than `.god/` — nothing already written breaks. (claude)
- 2026-08-22 Zero runtime dependencies, Node stdlib only. Buys a no-install-step story and nothing to audit; the cost is greedy batching instead of true clustering, and regex signatures instead of a parser. Both marked with `godkit:` ceilings. (claude)
- 2026-08-22 Rule files are **generated** from `AGENTS.md`, not hand-maintained copies. A generated file cannot be edited in the wrong place, so `--check` only ever fails because someone forgot to re-run it. (claude)
- 2026-08-22 A file's structural signature is derived from `graph.json` itself rather than a second store, so the two cannot disagree and strand the project in permanent full rebuilds. (claude)
- 2026-08-22 `meta.json` is written **last** on save. An interrupted run then reads as stale on the next arrival rather than being trusted as complete. (claude)
- 2026-08-22 Nothing shipped references any other project by name. Mechanisms were reimplemented from the idea, never copied as files — enforced by a test in `tests/package.test.js`. (claude)

## Last 3 handoffs

- 2026-08-22T0245Z-claude — done: godkit v1.0.0 built from the old subagent skill set. next: publish to npm, and run the live cross-tool test with a real Cursor session.
