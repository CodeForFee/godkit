---
id: {{ID}}
goal: "{{GOAL}}"
opened: {{UTC}}
status: open          # open | closed
---

## Goal

{{GOAL}}

## Waves

<!-- A wave is a set of tasks whose file scopes do not overlap, so they can run at once.
     Two tasks that share a file belong in different waves — that is the whole rule.
     Every wave ends at a join gate: one agent runs the full check suite after the merge.

| wave | tasks | join gate (the command) | result |
|---|---|---|---|
| 1 | T-001 T-002 | `npm test` | |
-->

| wave | tasks | join gate (the command) | result |
|---|---|---|---|

## Carried out

<!-- What moved to a later sprint, and why. Empty is a fine answer. -->
