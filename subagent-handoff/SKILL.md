---
name: subagent-handoff
description: >
  The shared-state protocol for a repo worked on by several AI agents — Claude, Cursor, Codex,
  Gemini, Copilot, or the same tool across different sessions. Defines .agent/BOARD.md (who is
  working where, open and fixed bugs, binding decisions) and .agent/log/ (one append-only entry
  per session), plus the clock-in and clock-out checklists that keep them true. Use at the START
  of any session that will edit code, at the END of any session that did, and whenever the user
  says "resume", "continue", "what was done", "who did what", "hand off", "log this", "pick up
  where X left off", asks whether a bug was already fixed, or mentions another tool or agent
  working on the same project. Also use when there is no .agent/ directory yet and work is about
  to start.
---

# Handoff

You share this repo. Another agent — a different model, a different tool, a different day — will
read what you leave and will trust it. Two rules make that work, and they are not negotiable:

**Read the board before you edit. Write your log before you finish.**

Everything else on this page is the shape of those two.

## The shared state

Two artifacts, both in the repo, both committed to git. In the repo because Cursor cannot read
Claude's memory directory and Claude cannot read Cursor's — **the only shared memory between
tools is the filesystem they both open**.

```
.agent/
├── BOARD.md          one screen, current truth, rewritten often
└── log/
    ├── 2026-08-19T1102Z-cursor.md
    └── 2026-08-19T1403Z-claude-82df4726.md
```

One log file per session, never edited by anyone else, is the whole trick: two tools writing at
the same moment never conflict, and git merges them without a thought. The board is small enough
that conflicts there are rare and trivial.

### `.agent/BOARD.md`

```markdown
# Board — <project name>

## Roster
| provider | can | cost | use for |
|---|---|---|---|
| claude-opus | repo-wide, shell, plan | high | root cause, multi-file refactor, seams |
| cursor | open files, shell | low | single-file edits, tests, stubs |
| codex-cli | repo, shell | low | mechanical passes, scripted repeats |
| commands | rg, npm test, tsc | free | every "does X / did it pass" question |

## Now (claims)
| agent | scope (file globs) | task | since (UTC) | status |
|---|---|---|---|---|
| claude | src/auth/* | fix token refresh | 2026-08-19T14:03Z | wip |
| cursor | src/ui/login.tsx | loading state | 2026-08-19T13:50Z | wip |

## Bugs
- [ ] B-004 login 500 when email contains `+` — found 2026-08-19 cursor (log 2026-08-19T1102Z-cursor)
- [x] B-003 token refresh loop — fixed 2026-08-19 claude, root cause `isExpired` src/auth/token.ts:88 (log 2026-08-19T1403Z-claude)

## Decisions
- 2026-08-19 tokens live in an httpOnly cookie, not localStorage — XSS. (claude)

## Last 3 handoffs
- 2026-08-19T1403Z-claude — done: token refresh. next: test the `+email` case.
- 2026-08-19T1102Z-cursor — partial: login spinner. next: error state still unstyled.
```

### `.agent/log/<UTC>-<agent>[-<session8>].md`

Filename is sortable-first: `2026-08-19T1403Z-claude-82df4726.md`. Timestamp, then tool, then the
first 8 characters of the session id if the tool has one.

```markdown
---
agent: claude-opus-5
session: 82df4726
started: 2026-08-19T13:40Z
ended: 2026-08-19T14:03Z
scope: src/auth/*
status: done          # done | partial | blocked
---

## Task
One line. What you were asked to do.

## Did
- guard the expiry comparison — src/auth/token.ts:88
- drop the now-dead retry wrapper — src/auth/refresh.ts:12-31

## Verified
- `npm test auth` → 14 pass
- manual: login with a `+` in the email → still 500 (B-004, not mine)

## Bugs
- fixed B-003 — refresh loop. Root cause was the shared `isExpired`, not the caller the report named.
- found B-004 — login 500 on `+` in email. Open, added to board.

## Decisions
- httpOnly cookie over localStorage — XSS.

## Left / next
- no test yet for the `+email` case
- did NOT touch src/auth/session.ts — cursor holds that claim
```

Sections may be empty. **"Left / next" may not be empty when status is `partial` or `blocked`** —
that section is the entire reason the next agent can start.

## Clock in

Before your first edit, every session:

1. **Read `.agent/BOARD.md`.** No `.agent/`? Create the directory and a board from the template
   above with empty sections, then continue. One-time, ten seconds, do not ask permission for it.
2. **Read the newest two log entries** (filenames sort chronologically), plus any entry whose
   `scope` overlaps files you are about to touch. `grep -l "src/auth" .agent/log/*.md` finds them.
   The **Roster** tells you which providers exist here and what each costs — route by capability
   first, then cheapest. An empty roster means nobody wrote one; add the providers you know about.
3. **Check the bug list before you fix anything.** Is this bug already `[x]`? Then read that log
   entry — either it regressed (say so, new ID) or you were about to redo finished work.
4. **Check the decisions.** They bind you. If one is wrong, argue with the user and record the
   reversal; do not silently contradict it.
5. **Claim your scope** — add a row to *Now* with file globs, your task, the UTC time, `wip`.

**If your scope overlaps an open claim, stop.** Do not edit. Options, in order: pick a
non-overlapping seam; do the work the claim holder listed under "Left / next" for a *different*
file; or, if the claim is older than 24h, mark it `stale`, take it over, and note the takeover in
your log. Never two owners on one file.

## While working

- Scope grew past your claim? **Widen the claim before touching the new files**, not after.
- Found a bug outside your scope? Add it to the board as a new `B-NNN` and keep going. Do not
  fix it — that is someone's claimed file, and an unclaimed drive-by fix is exactly the collision
  this protocol exists to prevent.
- Ponytail governs the code you write; the subagent ladder governs how you split the work.

## Clock out

Before your turn ends — every session that touched a file:

1. **Write the log entry.** The template above. Concrete file paths with line numbers, real
   commands with their real output. "Refactored auth" helps nobody.
2. **Update the board**: release your claim (delete the row), close or add bugs, add any decision,
   prepend one line to *Last 3 handoffs* and trim to three.
3. **Bug bookkeeping**: `B-NNN` ids are monotonic and never reused or renumbered. A fixed bug
   stays on the board with `[x]`, its fix location, and its log pointer — that is how the next
   agent tells "already fixed" from "never looked at". Record the **root cause location**, not the
   symptom: a sibling caller may still be broken, and the next agent needs to know where you
   actually cut.
4. **Commit `.agent/` with your code change**, if the repo uses git. The log and the diff belong
   in the same commit; separated, they drift.

## Memory: what goes where

Three tiers. Putting a fact in the wrong one is how knowledge gets lost.

| Tier | Lives in | Holds | Who reads it |
|---|---|---|---|
| **Log** | `.agent/log/*.md` | what happened this session | every agent, forever |
| **Board** | `.agent/BOARD.md` | current claims, open/fixed bugs, binding decisions | every agent, first thing |
| **Private memory** | the tool's own store | user preferences, tool quirks, cross-project habits | that one tool only |

Rules:

- **If another agent needs it, it goes in `.agent/`.** Private memory is invisible to every other
  tool. A decision recorded only in Claude's memory does not exist for Cursor.
- **Do not write memory for what the repo already records.** Code structure, git history, what a
  function does, a fix you already logged — all already written down. Memory that duplicates the
  repo goes stale and then lies.
- Private memory is for what the repo cannot say: how the *user* wants to work, which tool broke
  on what, standing preferences.
- Per-tool locations: Claude Code `~/.claude/projects/<slug>/memory/` with a `MEMORY.md` index;
  Cursor project rules under `.cursor/rules/`; Codex and most others `AGENTS.md`. When in doubt,
  `.agent/BOARD.md` under Decisions — every tool can read it.

## Splitting work across tools

When several agents work at once:

- **One owner per file.** Split seams on file boundaries, never on "layers" that share files.
- Two seams must touch the same file → **serialize them**. The wall-clock you save by
  parallelizing is smaller than the merge bug you buy.
- Each parallel worker gets its own claim, its own scope, its own log entry.
- **The join is a gate**: after the parallel work merges, one agent runs the full check suite and
  logs the result. Nobody is done until the join passes.

## Output

After clocking out, one line:

`logged: .agent/log/<file> — <status>. board: <claim released | B-00N fixed | decision added>.`

No summary of the summary. The log entry is the record; the chat is not.
