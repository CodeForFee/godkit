---
id: T-004
title: Hook runtime and session isolation
owner: Singer
scope: lib/paths.js, lib/lazy.js, lib/session.js, runtime hooks except installer/config, focused hook tests
exit: Safe agent context, bounded brief, isolated lazy/work state, exact clockout regressions pass
phase: plan
created: 2026-08-22T14:04:10Z
---

## Plan

Centralize safe session state, resolve worktree/shared agent context, bound no-follow reads, track work by session/tool fingerprint, and require exact session evidence at Stop.

## Execute

Pending isolated worktree.

## Review

Pending.

## Test

- Required: focused path, brief, lazy, work, clockout, and hook smoke tests.

## Handoff

- Start after T-001 checkpoint; hand the stable runtime API to T-005.
