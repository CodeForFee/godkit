---
agent: ""             # the tool and model that ran, e.g. claude-opus-5
session: ""           # the host's session id; the filename carries its first 8 characters
started: ""
ended: ""             # UTC, e.g. 2026-08-19T1403Z
scope: ""             # file globs you actually touched
status: "done"        # done | partial | blocked
skills: ""            # .agent/skills/ skills you used, comma-separated. Empty is fine.
---

## Task

<!-- One line. What you were asked to do. -->

## Did

<!-- What changed. path/to/file.ts:88. Real paths, not "refactored auth". -->

## Verified

<!-- The command run and its real output: `npm test` -> 12 passing.
     `godkit verify` requires this when status is `done`. "Should work" is not a result. -->

## Bugs

<!-- fixed B-00N - the symptom. Root cause: where you actually cut.
     found B-00N - the symptom. Open, added to the board. -->

## Decisions

<!-- What was decided, and why. -->

## Left / next

<!-- What you deliberately did not do, and whose claim you stayed off.
     `godkit verify` requires this when status is `partial` or `blocked` - it is the
     entire reason the next agent can start. -->
