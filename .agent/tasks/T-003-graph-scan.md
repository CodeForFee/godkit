---
id: T-003
title: Graph transaction and scan safety
owner: Kuhn
scope: lib/graph.js, lib/scan.js, tests/graph.test.js, tests/scan.test.js
exit: Absolute IDs rejected, edge last-wins, atomic graph write, ignore matcher safe
phase: plan
created: 2026-08-22T14:04:10Z
---

## Plan

Add fail-before-write graph validation and atomic writes, make duplicate edges last-wins, and implement the documented safe ignore subset without regex crashes.

## Execute

Pending isolated worktree.

## Review

Pending.

## Test

- Required: `node --test tests/graph.test.js tests/scan.test.js`.

## Handoff

- Start after T-001 checkpoint; commit code, this task, and a unique log after verification.
