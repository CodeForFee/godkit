---
id: T-002
title: Evolve snapshot and evidence safety
owner: unrecorded     # predates the model-id rule; not back-filled
scope: lib/evolve.js, templates/log.md, tests/evolve.test.js
exit: Snapshot, quarantine, parser, trust, and cleanup regressions pass
phase: done
created: 2026-08-22T14:04:10Z
---

## Plan

Replace live project-skill projections with owned SHA-256 snapshots, harden frontmatter and safety scanning, preserve foreign targets, and clean every test fixture.

## Execute

- Project skills project as owned snapshots: a `.godkit-link` marker carries owner, version, skill
  name and a SHA-256 tree hash, so godkit replaces only what it wrote and never removes a foreign
  target. The old plain-text marker is still recognised as legacy.
- Frontmatter parsing handles quoted scalars, `#` comments, block scalars and duplicate keys, and
  reports malformed metadata as blocking findings instead of silently mis-parsing it.
- `origin` and `enabled` must now be declared explicitly and validly; an unreadable, symlinked, or
  non-regular skill is a blocking finding.
- Safety scan widened: symlinks, executable extensions, executable mode bits, and executable magic
  bytes (shebang, ELF, PE, Mach-O, wasm) all block linking.
- `templates/log.md` quotes its frontmatter scalars so a generated log parses under the stricter reader.

## Review

- Diff is limited to the three claimed files plus this task and one session log.
- Node 18, zero runtime dependencies, and version `1.0.0` unchanged.
- `git diff --check` is clean; no fixture directories are left behind.

## Test

- `node --test tests/evolve.test.js` -> 36 passed, 0 failed.
- `npm test` -> 109 passed, 0 failed.

## Handoff

- FOR T-007 (docs): `enabled` and `origin` are now required frontmatter, not optional. A hand-written
  skill with no frontmatter no longer links. README and `skills/godkit-evolve/SKILL.md` should say so.
- Known ceiling: `frontmatter()` is a hand-rolled YAML subset (quoted scalars, comments, block
  scalars). It is deliberate under the zero-dependency constraint — widen it only against a real
  failing skill, never speculatively.
- Snapshot marker contract for later seams: `{ owner: "godkit-project-skill-snapshot", version: 1,
  skill, sha256 }`, hash excluding the root marker itself.
