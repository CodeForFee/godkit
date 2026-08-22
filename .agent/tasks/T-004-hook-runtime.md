---
id: T-004
title: Hook runtime and session isolation
owner: Singer
scope: lib/paths.js, lib/lazy.js, lib/session.js, lib/work.js, runtime hooks except installer/config, focused hook tests
exit: Safe agent context, bounded brief, isolated lazy/work state, exact clockout regressions pass
phase: done
created: 2026-08-22T14:04:10Z
---

## Plan

Centralize safe session state, resolve worktree/shared agent context, bound no-follow reads, track work by session/tool fingerprint, and require exact session evidence at Stop.

## Execute

- `lib/session.js` (new): host-neutral hook input, session ids hashed before they become path
  components, per-session state under a Godkit-owned root, atomic writes with optional
  compare-and-swap.
- `lib/work.js` (new): session-owned work evidence. Shell tools compare a before/after Git
  fingerprint that excludes `.agent/`; edit tools mark work only for successful paths outside it.
- `lib/paths.js`: `findAgentContext` resolves the MAIN worktree's `.agent/` from a linked
  worktree, refuses symlinks below it, and adds byte-bounded `readContained`/`fitBytes`.
- `hooks/brief.js`: bounded, no-follow section reads under one brief budget.
- `hooks/clockout.js`: blocks on this session's recorded work, not on a dirty tree; restored the
  `stop_hook_active` short-circuit that keeps a blocked turn from looping.
- `hooks/work-track.js` (new): pre/post/edit/end lifecycle hook feeding that evidence.
- `hooks/lazy-*.js`, `hooks/map-watch.js`: session-scoped state, matcher fails closed.
- Repaired cp1252-double-encoded `…`/`—` in `lib/paths.js`, `lib/lazy.js`, `hooks/brief.js`,
  `hooks/lazy-mode-tracker.js`.

## Review

- Diff stays inside the claimed scope plus this task file and one session log.
- `hooks/godkit-hooks.json` is untouched — registration is T-005's.
- Node 18, zero runtime dependencies, and version `1.0.0` unchanged.
- `git diff --check` is clean.

## Test

- `node --test tests/hooks.test.js tests/runtime.test.js` -> 30 passed, 0 failed, 1 skipped.
- `npm test` -> 114 passed, 0 failed, 1 skipped (symlink test skips without privileges).
- `tests/runtime.test.js` (new) covers agent context across worktrees, contained/bounded reads,
  state isolation and cleanup, fingerprint and direct-edit evidence, and lazy mode isolation.
- Hook tests now point `CLAUDE_CONFIG_DIR` at a temp dir, so no test writes real home config.

## Handoff

- BLOCKING FOR T-005: `hooks/work-track.js` is written but NOT registered in
  `hooks/godkit-hooks.json`. Until T-005 registers it on PreToolUse / PostToolUse / SessionEnd,
  no session records work and clockout can never block. Register it before closing B-006.
- Stable API for T-005: `lib/session.js` (`readHookInput`, `sessionId`, `readState`, `writeState`,
  `clearSession`, `atomicWriteFile`), `lib/work.js` (`captureBefore`, `finishAfter`,
  `recordDirectEdit`, `didSessionWork`, `clearWork`), `lib/paths.js` (`findAgentContext`).
- Deliberate behaviour change: a bad `GODKIT_LAZY_SUBAGENT_MATCHER` now skips injection instead of
  injecting into every subagent.
