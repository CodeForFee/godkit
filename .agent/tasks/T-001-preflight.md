---
id: T-001
title: Preflight and map checkpoint
owner: unrecorded     # predates the model-id rule; not back-filled
scope: .agent/**
exit: Full map saved with --replace; doctor current; shared tasks and claims committed
phase: done
created: 2026-08-22T14:04:10Z
---

## Plan

Run the baseline suite, rebuild the stale map from a fresh scan, compact BOARD, create T-001…T-008, and checkpoint shared state before opening implementation worktrees.

## Execute

- Baseline `npm test` passed 97/97.
- Fresh scan found 89 files in 32 batches.
- Merged 143 nodes and 268 observed edges, then saved the graph with `--replace`.
- Compacted BOARD and created T-001…T-008 with exclusive owners, scopes, exits, and dependency order.

## Review

Clean. Every scanned file has a node; generated graph has no duplicate IDs, absolute IDs, or dangling edges.

## Test

- `npm test` -> 97 passed, 0 failed.
- `node bin/godkit.js doctor` -> map is current.
- Graph integrity probe -> 143 nodes, 268 edges, 0 duplicates, 0 absolute IDs, 0 dangling edges.
- `git diff --check` -> clean.

## Handoff

- None. T-002, T-003, and T-004 may start from this checkpoint.
