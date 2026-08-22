---
agent: "{{AGENT}}"
session: "{{SESSION}}"
started: "{{STARTED}}"
ended: "{{UTC}}"
scope: "{{SCOPE}}"
status: "done"        # done | partial | blocked
skills: ""            # .agent/skills/ skills you used, comma-separated. Empty is fine.
---

## Task

One line. What you were asked to do.

## Did

- <what changed> — path/to/file.ts:88

## Verified

- `<command>` -> <real output>

## Bugs

- fixed B-00N — <symptom>. Root cause <where you actually cut>.
- found B-00N — <symptom>. Open, added to board.

## Decisions

- <what was decided> — <why>.

## Left / next

- <what you deliberately did not do>
- did NOT touch <path> — <agent> holds that claim
