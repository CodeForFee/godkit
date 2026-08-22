---
id: T-006
title: CLI, freshness, and managed init
owner: root
scope: bin/godkit.js, lib/freshness.js, lib/managed.js, Git templates, CLI/init/save/freshness tests
exit: Partial save, managed init, ownership, doctor, and hook subcommands work end-to-end
phase: plan
created: 2026-08-22T14:04:10Z
---

## Plan

Integrate replacement-scoped map saves and crash markers, fail-closed freshness, managed host/Git blocks, complete doctor states, and explicit hook lifecycle commands.

## Execute

Blocked on T-002…T-005.

## Review

Pending.

## Test

- Required: CLI, init, save, freshness, ownership, and doctor integration suites.

## Handoff

- Start on root only after all runtime branches are merged and reverified.
