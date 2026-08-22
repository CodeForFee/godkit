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
- 2026-08-22 Audited two sibling skill collections (24 general engineering skills + 12 frontend-taste skills) against godkit's coordination charter. Outcome: 3 new skills where no existing skill owned the topic (`godkit-git` — worktrees/commit-as-checkpoint/`.agent/` merges; `godkit-doubt` — pre-commit pressure-test of a decision before it binds every agent; `godkit-frontend` — UI design-taste dials and banned defaults, added at the user's explicit request after the initial audit scoped it out), 6 small edits where a topic already had a home (`godkit-lazy`, `godkit-plan`, `godkit-test`, `godkit-execute`, `godkit-handoff` ×2), 1 declined merge (`godkit-review` already excludes ordinary code-correctness review by its own Boundaries line), rest out of charter. The banned-name test was extended to cover both source collections' identifiers, which also caught those identifiers appearing in `.agent/BOARD.md` and `.agent/log/` themselves — the walk was never scoped away from `.agent/`, so the same no-attribution policy now applies there too, not just to shipped files. (claude)
- 2026-08-22 User asked for the full 13-skill frontend-taste collection ported, not just the condensed `godkit-frontend`, then separately asked all of it be organized under one folder rather than scattered as top-level skill directories. Resolution: `godkit-frontend` stays the one real, installable skill; the other 11 frontend-domain variants became `skills/godkit-frontend/references/<name>.md` — loaded on demand, same convention as `skills/godkit/references/PATTERNS.md` — instead of 11 more top-level skill+command pairs. `godkit-output-enforcement` (anti-truncation/anti-stub enforcement) stayed a separate top-level skill since it isn't frontend-specific — applies to any generated deliverable. (claude)
- 2026-08-22 Ported the always-on mode-injection mechanism from the same sibling lazy-coding project `godkit-lazy` was originally built from: `lib/lazy.js` resolves the active level (`GODKIT_LAZY_MODE` env var → `~/.config/godkit/config.json` → `full`), three new hooks (`lazy-activate.js` on SessionStart, `lazy-subagent.js` on SubagentStart, `lazy-mode-tracker.js` on UserPromptSubmit) keep it active every turn and every spawned subagent, and `/godkit-lazy [lite|full|ultra|off]` switches it mid-session. One shared `lib/lazy.js` instead of the source's four-file split — godkit only supports 2 hook-capable hosts, not ~6. Left out on purpose: the statusline badge and the measured-impact scoreboard — the scoreboard needs real measurement against a real repo, and fabricating numbers was rejected as dishonest. Found and fixed two real bugs while building this: `hooks/install.js` silently dropped `brief.js`'s registration once a second script shared its event (fixed by grouping the `kept`-computation per event, not per script), and the mode-tracker's report-only path read the configured default instead of the session's live mode. (claude)
- 2026-08-22 Project-local skills live in `.agent/skills/<name>/SKILL.md` and are **linked per skill** into `<project>/.claude/skills/` and `<project>/.agents/skills/` — never a folder link, which would clobber a user's own skills there and would make phase 2's quarantine unenforceable. No new store: the skills directory and the log stream are the store, same argument as the graph being its own signature source. The evolve mode gate (`audit_only` default) is enforced mechanically at the link step, not by asking a skill's instructions nicely — in `audit_only` a generated skill is a committed but inert file no host can load. Dropped from the source design: SQLite + 7 tables (`node:sqlite` is 22+, engines say 18), embedding/BM25 ranking (the host already ranks on `description`), the behaviour-eval worker and skill sandbox (a skill is instructions, not code), staged authoring (git is the audit trail), cloud hub, redaction. Claude Code's project path is verified against two unrelated repos on this machine; **Codex's `.agents/skills/` is inferred and unverified**. (claude)

## Last 3 handoffs

- 2026-08-22T1126Z-claude — done: #5 phase 1, project-local skills (`lib/evolve.js`, `godkit skills`, `godkit-evolve` skill, `skills:` log field, 13 tests). Caught a latent `rm -rf` in `bin/godkit.js`'s `link()` that this feature would have pointed at users' own project skills — `lib/evolve.js` uses its own guarded linker instead. next: phase 2 (`godkit/skill-evidence`) — the trust loop, `godkit evolve`, `.agent/SKILLS.md`.
- 2026-08-22T0419Z-claude — done: polished README.md — badge row (CI/license/node/zero-deps, no npm badge since unpublished), a Contents anchor list, Hooks table switched to filename-keyed to match docs/agent-portability.md. No facts changed. next: nothing planned.
- 2026-08-22T0415Z-claude — done: ported the mode-injection hook mechanism (SessionStart/SubagentStart/UserPromptSubmit) for godkit-lazy, fixed two bugs found along the way (install.js multi-hook-per-event, mode-tracker report-only path). next: the 3 skill gaps from the earlier lazy-coding-collection audit (audit/debt/review-style skills) are still unbuilt.
