---
id: T-003
title: Graph transaction and scan safety
owner: Kuhn
scope: lib/graph.js, lib/scan.js, tests/graph.test.js, tests/scan.test.js
exit: Absolute IDs rejected, edge last-wins, atomic graph write, ignore matcher safe
phase: done
created: 2026-08-22T14:04:10Z
---

## Plan

Add fail-before-write graph validation and atomic writes, make duplicate edges last-wins, and implement the documented safe ignore subset without regex crashes.

## Execute

- `lib/graph.js` rejects POSIX, drive-letter, and UNC absolute paths in every graph ID location before normalization or writing.
- Duplicate typed edges now use last-wins payload semantics; dangling edges are still dropped.
- Exported `atomicWriteFile(file, data)` and routed `saveGraph` through a same-directory temp-and-rename transaction with failure cleanup.
- `lib/scan.js` now compiles the supported `*`/`?`, rooted, path, and directory ignore subset safely; negation and `**` rules are skipped.

## Review

- Diff is limited to the four claimed source/test files plus this task and one session log.
- Persisted graph schema, `filePath` sanitization, Node 18 compatibility, and zero-dependency contract are unchanged.
- `git diff --check` is clean.

## Test

- `node --test tests/graph.test.js tests/scan.test.js` -> 25 passed, 0 failed.
- `npm test` -> generated rules and versions clean; 100 passed, 0 failed.

## Handoff

- T-006 may import `atomicWriteFile(file, data)` from `lib/graph.js` for its adjacent transactional writes.
- Negation and `**` remain deliberately unsupported and fail open by skipping those rules.
