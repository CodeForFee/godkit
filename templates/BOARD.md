# Board — {{PROJECT}}

One screen. Current truth. Rewritten often. Read this before you edit anything.

**Sprint:** none — `godkit sprint new "<goal>"` opens one

## Roster

Name the **model**, not the tool. One tool runs many models, and cost and capability belong to the
model. These rows are examples — replace them with the models this project actually uses.

| model | tool | can | cost | use for |
|---|---|---|---|---|
| claude-opus-5 | claude-code | repo-wide, shell, plan | high | root cause, multi-file refactor, cutting seams |
| claude-sonnet-5 | claude-code, cursor | repo-wide, shell | mid | scoped edits, tests, review passes |
| codex-5.6-terra | codex | repo, shell | mid | mechanical passes, scripted repeats |
| gemini-3.8-flash | antigravity | repo, browser | low | UI work, verification against a running app |
| commands | — | rg, test suite, tsc | free | every "does X / did it pass" question |

Route by capability first, then cheapest. Delete rows for models this project does not use.

## Now (claims)

| model | scope (file globs) | task | since (UTC) | status |
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
