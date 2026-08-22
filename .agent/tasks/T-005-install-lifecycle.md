---
id: T-005
title: Install lifecycle ownership
owner: Singer
scope: lib/install.js, hooks/install.js, scripts/uninstall.js, hooks/godkit-hooks.json, installer tests
exit: Foreign skills/hooks survive; mixed groups preserved; Claude/Codex writes atomic and correct
phase: plan
created: 2026-08-22T14:04:10Z
---

## Plan

Build one ownership-aware install library, filter hook handlers individually, support safe standalone host paths and dry-run, and share lifecycle logic with uninstall.

## Execute

Blocked on T-004 runtime API.

## Review

Pending.

## Test

- Required: hook installer and install lifecycle suites plus evolve ownership regressions.

## Handoff

- Begin in a fresh worktree after T-004 is merged.
