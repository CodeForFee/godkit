---
id: T-006
title: CLI, freshness, and managed init
owner: claude
scope: bin/godkit.js, lib/freshness.js, lib/managed.js, tests/cli.test.js
exit: Partial save, managed init, ownership, doctor, and hook subcommands work end-to-end
phase: done
created: 2026-08-22T14:04:10Z
---

## Plan

Integrate replacement-scoped map saves and crash markers, fail-closed freshness, managed host/Git blocks, complete doctor states, and explicit hook lifecycle commands.

## Execute

- `lib/managed.js` (new): a marked block inside a file the user also owns. `godkit init` used to
  skip any host file that already existed — which silently meant "this project gets no rules" —
  and overwriting would have eaten the user's text. Now our body lives between markers, everything
  outside them is untouched, and hand-mangled markers are refused rather than guessed at.
- `godkit init` writes those blocks into AGENTS.md, CLAUDE.md, `.cursor/rules/godkit.mdc`,
  `.agents/rules/godkit.md`, and now `.gitattributes` — target projects never got the `-merge`
  rules that keep a generated map out of a textual merge.
- `godkit save`: a node whose file no longer exists is dropped on a partial save. Nothing in a
  refresh pass ever mentions a deleted file, so the stale node survived every merge before this.
- MAP.md and meta.json now go through `atomicWriteFile` (the T-003 handoff), keeping the
  graph → map → meta write order that makes an interrupted save read as stale.
- `lib/freshness.js` fails CLOSED: an unreadable `git status`, an unreachable `meta.sha` (rebased
  away, shallow clone) and a failed diff no longer report "fresh". Status is read with `-z` and
  parsed by `statusPaths` from lib/work.js, so a rename stops inventing a filename.
- `godkit hooks [status|install|uninstall] [--dry-run]` replaces "go run this script by hand", and
  `godkit doctor` now ends with hook registration — the half that fails silently.
- `godkit install` / `uninstall` route through `lib/install.js`, so the `link()` helper that
  removed whatever was in the way is gone.

## Review

- `writeIfAbsent` is still used for `.agent/` scaffolding, where never-clobber is right: those
  files are written by agents, not by godkit.
- Node 18, zero runtime dependencies, version `1.0.0` unchanged. `git diff --check` clean.

## Test

- `node --test tests/cli.test.js` -> 17 passed, 0 failed.
- `npm test` -> 158 passed, 0 failed, 1 skipped.
- New regressions: managed block create/append/update/unchanged/refuse/remove, init preserving user
  text, init idempotence, partial save dropping deleted nodes and keeping untouched ones,
  working-tree and rename staleness, unreachable sha, no-git, and a hooks install/uninstall
  round-trip in an isolated settings file.

## Handoff

- FOR T-007: `npm run check` should gain `node scripts/sync-hooks.js --check`. Docs need the new
  `godkit hooks` command, the managed-block behaviour of `init` (it no longer skips existing host
  files), and `--dry-run` on install/uninstall.
- Known: running `godkit init` inside the godkit repo itself would wrap its own AGENTS.md in
  markers and break `scripts/sync-rules.js`. Not guarded — the test suite catches it immediately
  and nobody scaffolds godkit into godkit.
