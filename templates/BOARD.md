# Board — {{PROJECT}}

One screen. Current truth. Rewritten often. Read this before you edit anything.

## Roster

| provider | can | cost | use for |
|---|---|---|---|
| claude-code | repo-wide, shell, plan | high | root cause, multi-file refactor, cutting seams |
| cursor | open files, shell | low | single-file edits, tests, stubs |
| codex | repo, shell | low | mechanical passes, scripted repeats |
| antigravity | repo, browser | low | UI work, verification against a running app |
| commands | rg, test suite, tsc | free | every "does X / did it pass" question |

Route by capability first, then cheapest. Delete rows for tools this project does not use.

## Now (claims)

| agent | scope (file globs) | task | since (UTC) | status |
|---|---|---|---|---|

One owner per file. If your scope overlaps an open row, do not edit — see AGENTS.md.

## Tasks

| id | title | owner | phase | file |
|---|---|---|---|---|

## Bugs

<!-- B-NNN monotonic, never reused. Fixed bugs stay listed with their root-cause location. -->

## Decisions

<!-- One line each: date, what was decided, why, who. These bind the next agent. -->

## Last 3 handoffs

<!-- newest first, trimmed to three -->
