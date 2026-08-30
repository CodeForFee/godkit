---
id: {{ID}}
title: {{TITLE}}
owner: unassigned
scope:
exit:
phase: plan
blocked:              # needs-decision | needs-evidence | external-wait | needs-owner
created: {{UTC}}
---

## Plan

<!-- The seam: which files, in what order, and why cut here. Exit condition must be checkable. -->

## Execute

<!-- What actually changed. file:line. Real paths, not "refactored auth". -->

## Review

<!-- One line per finding. Nothing to say is a valid result: say "clean". -->

## Test

<!-- The command run and its real output. "Should work" is not a result.
     `godkit verify` requires this when phase is `done`. -->

## Handoff

<!-- Left / next. MUST be non-empty unless phase is `done` — this is why the next agent can start.
     `godkit verify` checks it, and a `blocked` phase also needs a typed `blocked:` reason. -->
