# Memory: what goes where

Part of the **godkit-handoff** skill, loaded on demand.

## Memory: what goes where

Four tiers. Putting a fact in the wrong one is how knowledge gets lost.

| Tier | Lives in | Holds | Who reads it |
|---|---|---|---|
| **Map** | `.agent/MAP.md`, `graph.json` | what the codebase *is* | every agent, on arrival |
| **Skills** | `.agent/skills/`, `SKILLS.md` | procedures this project repeats — see **godkit-evolve** | every agent, on arrival |
| **Board** | `.agent/BOARD.md` | current claims, bugs, binding decisions | every agent, first thing |
| **Log** | `.agent/log/*.md` | what happened this session | every agent, forever |
| **Private** | the tool's own store | user preferences, tool quirks, cross-project habits | that one tool only |

Rules:

- **If another agent needs it, it goes in `.agent/`.** Private memory is invisible to every other tool. A decision recorded only in Claude's memory does not exist for Cursor.
- **Bootstrap from the map, not from opening files.** `.agent/MAP.md` exists so arrival costs a read, not a re-derivation — grep it for what a piece of code is before reading the code itself. Re-deriving architecture turn by turn is the cost this whole protocol exists to avoid.
- **Do not record what the repo already records.** Code structure, git history, what a function does, a fix you already logged — all already written down. Memory that duplicates the repo goes stale and then lies.
- Private memory is for what the repo cannot say: how the *user* wants to work, which tool broke on what, standing preferences.
- In doubt, put it under Decisions on the board. Every tool can read it.
