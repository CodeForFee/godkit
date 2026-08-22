---
id: T-002
title: Evolve snapshot and evidence safety
owner: Hooke
scope: lib/evolve.js, templates/log.md, tests/evolve.test.js
exit: Snapshot, quarantine, parser, trust, and cleanup regressions pass
phase: plan
created: 2026-08-22T14:04:10Z
---

## Plan

Replace live project-skill projections with owned SHA-256 snapshots, harden frontmatter and safety scanning, preserve foreign targets, and clean every test fixture.

## Execute

Pending isolated worktree.

## Review

Pending.

## Test

- Required: `node --test tests/evolve.test.js`.

## Handoff

- Start after T-001 checkpoint; commit code, this task, and a unique log after verification.
