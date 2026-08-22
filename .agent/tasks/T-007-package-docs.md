---
id: T-007
title: Package, docs, and release contracts
owner: claude
scope: package.json, .github/workflows, scripts/check-versions.js, templates/gitattributes, README.md, docs/agent-portability.md, skills/godkit-evolve/SKILL.md, tests/package.test.js
exit: Packed install smoke passes; manifests/Gemini/release contracts and docs agree
phase: done
created: 2026-08-22T14:04:10Z
---

## Plan

Fix Gemini placeholders, Codex manifest shape, tarball allowlist and installed smoke, strict version/tag gates, tag-only publish workflow, and all public compatibility claims.

## Execute

- Tarball allowlist: `godkit init` read this repo's own `.gitattributes`, which is not in `files` —
  it worked from a git checkout and crashed from an installed package. The lines now ship as
  `templates/gitattributes`, and a contract test asserts this repo lives by the same rules.
- `tests/package.test.js` gained a packed-install smoke: it takes the real `npm pack` allowlist,
  copies exactly those files into a temp directory and runs `godkit init` from there. That is the
  only check that catches a runtime file missing from `files`.
- `npm run check` now also runs `scripts/sync-hooks.js --check`, and both workflows run it.
- `scripts/check-versions.js` no longer skips its tag comparison when the tag name is empty or not
  a `vX.Y.Z` release tag — the case where skipping is most dangerous.
- `publish.yml` is tag-only: `workflow_dispatch` is gone, because it could publish a branch that
  the tag gate never examined.
- Docs corrected against the code: managed-block `init`, `godkit hooks`, `--dry-run`, install
  ownership, session-scoped clockout, `work-track.js`, required `origin`/`enabled` frontmatter,
  the generated hook manifest, and what `commands/` actually reaches.

## Review

- `gemini-extension.json` and `.codex-plugin/plugin.json` keep their `skills`/`agents` pointers.
  They are unverifiable from here, so instead of guessing at a schema the doc now marks them
  best-effort and names what IS verified — the same honesty convention the repo already used for
  Codex project-local skills.
- `scripts/sync-hooks.js` is deliberately NOT in `files`: it is a CI tool, and the manifest it
  generates is already generated before publish.
- Node 18, zero runtime dependencies, version `1.0.0` unchanged. `git diff --check` clean.

## Test

- `npm test` -> 160 passed, 0 failed, 1 skipped (161 total).
- `npm run check` -> rules, hook manifest and versions all in sync.
- `npm pack --dry-run` -> 77 files.
- Tag gate: `v1.0.0` passes; `v9.9.9` and an empty tag both exit 1.

## Handoff

- Nothing blocking. T-008 owns the final join, the map rebuild and closing B-009.
