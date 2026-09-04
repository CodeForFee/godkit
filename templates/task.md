---
id:                   # T-NNN, monotonic, never reused
title:
owner: unassigned     # a model id once claimed — claude-opus-5, codex-5.6-terra, gemini-3.6-pro.
                      # The tool name is not an owner: one tool runs many models.
scope:                # file globs — this is what makes overlap detectable
exit:                 # the command that proves this done, not a description of done
phase: plan           # plan | execute | review | test | done | blocked
blocked:              # only when phase is blocked: needs-decision | needs-evidence | external-wait | needs-owner
created:              # UTC, e.g. 2026-08-19T1340Z
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
