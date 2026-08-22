---
id: T-005
title: Install lifecycle ownership
owner: claude
scope: lib/install.js, hooks/install.js, scripts/uninstall.js, scripts/sync-hooks.js, hooks/godkit-hooks.json, installer tests
exit: Foreign skills/hooks survive; mixed groups preserved; Claude/Codex writes atomic and correct
phase: done
created: 2026-08-22T14:04:10Z
---

## Plan

Build one ownership-aware install library, filter hook handlers individually, support safe standalone host paths and dry-run, and share lifecycle logic with uninstall.

## Execute

- `lib/install.js` (new) is the single source of truth for what godkit installs and what it may
  remove. `HOOKS` lists every registration once; both the standalone installer and the plugin
  manifest are derived from it.
- Registered the T-004 work-track lifecycle: PreToolUse/Bash `pre`, PostToolUse/Bash `post`,
  PostToolUse/edit-tools `edit`, SessionEnd `end`. Without these clockout could never fire.
- Hook filtering is per HANDLER, not per group: a user hook sharing a group with ours now survives
  install and uninstall.
- Settings writes go through `atomicWriteFile` with compare-and-swap against the bytes read plus a
  `.bak`, so a concurrent editor loses nothing and a crash cannot truncate the file.
- Skill directories carry ownership: a link resolving into this package, or a copy with a
  `.godkit-install.json` marker, is ours; anything else is refused by install and kept by uninstall.
- `scripts/uninstall.js` now shares that logic, honours `CLAUDE_CONFIG_DIR`/`CODEX_HOME`, and
  removes the T-004 session-state root instead of the flag file that no longer exists.
- `scripts/sync-hooks.js` (new) generates `hooks/godkit-hooks.json` from `HOOKS`, with `--check`.

## Review

- Scope crossing, deliberate: `tests/package.test.js` (T-007's file) froze the hook event list, so
  adding events broke it. Replaced the hardcoded list with one derived from `HOOKS` — 3 lines.
- `bin/godkit.js` still uses its own `link()` which removes whatever is in the way. That is T-006's
  file and its handoff item, not a silent leftover.
- Node 18, zero runtime dependencies, version `1.0.0` unchanged. `git diff --check` clean.

## Test

- `node --test tests/hook-install.test.js` -> 19 passed, 0 failed.
- `npm test` -> 141 passed, 0 failed, 1 skipped.
- New regressions: work-track registration, per-handler filtering, dry-run on both sides,
  non-object settings refused, `applyHooks` purity, manifest/installer agreement, and skill
  ownership (foreign refused, ours replaceable, plain file in the way is foreign).

## Handoff

- FOR T-006: `bin/godkit.js` `cmdInstall`/`cmdUninstall` must call `installOne(src, dest, dryRun)`
  and `removeOne(dest, src, dryRun)` from `lib/install.js`. The `link()` helper in bin deletes any
  directory in the way — that is the last remaining path where a foreign skill can be destroyed.
  `doctor` should also report hook registration using `settingsTargets()` + `isOurHandler`.
- FOR T-007: `npm run check` should gain `node scripts/sync-hooks.js --check` next to
  `sync-rules.js --check`; the test enforces it today, the check script makes CI say why.
  Confirm `scripts/` is in the package `files` allowlist — uninstall and sync both live there.
