---
id: T-008
title: Join verification and handoff
owner: root
scope: .agent/** and read-only repository-wide verification
exit: Join gate green; independent diff review clean; map current; bugs closed; claims released
phase: plan
created: 2026-08-22T14:04:10Z
---

## Plan

Run the full acceptance gate, independently review the integrated diff, rebuild the map with repaired code, close findings, release every claim, and commit the final handoff.

## Execute

Pending T-002…T-007.

## Review

Pending.

## Test

- Required: `npm test`, pack/publish dry-runs, rule sync, doctor, diff check, status audit, and map integrity.

## Handoff

- Join only after every seam has its targeted-test evidence and commit.
