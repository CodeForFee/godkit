# The shared state: file formats

Part of the **godkit-handoff** skill, loaded on demand.

## The shared state

All of it lives in the repo and is committed. In the repo because Cursor cannot read Claude's memory directory and Claude cannot read Cursor's — **the only shared memory between tools is the filesystem they both open**.

```
.agent/
├── BOARD.md              one screen, current truth, rewritten often
├── THREAD.md             append-only conversation between agents
├── MAP.md                what this codebase is (generated — see godkit-map)
├── graph.json            the machine-readable map
├── SKILLS.md             this project's own skills (generated — see godkit-evolve)
├── skills/
│   └── refresh-fixture-db/SKILL.md
├── tasks/
│   └── T-003-token-refresh.md
└── log/
    ├── 2026-08-19T1102Z-cursor.md
    └── 2026-08-19T1403Z-claude-82df4726.md
```

One log file per session, never edited by anyone else, is the whole trick: two tools writing at the same moment never conflict, and git merges them without a thought. The board stays small enough that conflicts there are rare and trivial.

### `.agent/BOARD.md`

Sections: **Roster** (which providers exist here, what each can do, what each costs), **Now** (open claims), **Tasks** (the index), **Bugs**, **Decisions**, **Last 3 handoffs**. Keep it to one screen — the moment it needs scrolling, it stops being read.

A Decisions entry earns its place only if it states the **reason**, not just the outcome — "X
over Y" with no why cannot be revisited when the reason stops holding, only obeyed. Worth a
pressure-test before it goes in — see **godkit-doubt** — since every future agent that reads it
treats it as binding.

### `.agent/tasks/T-NNN-<slug>.md`

One file per task, carrying all five phases as sections that fill in as work moves. Frontmatter is the machine-readable part — `godkit verify` parses exactly these fields:

<!-- godkit:task-frontmatter -->

```markdown
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
```

<!-- /godkit:task-frontmatter -->

Filled in, that reads:

```markdown
---
id: T-003
title: fix token refresh loop
owner: claude
scope: src/auth/*
exit: `npm test auth` green and no refresh loop over a 2h session
phase: execute
blocked:
created: 2026-08-19T1340Z
---

## Plan
## Execute
## Review
## Test
## Handoff
```

`scope` and `exit` are not optional. A task with no exit condition cannot be finished, only abandoned. **Handoff may not be empty unless `phase: done`.**

Ids are monotonic and never reused. A finished task keeps its file — that is the record of why the code looks the way it does.

### `.agent/THREAD.md`

For messages that need a reader. Append only, newest at the bottom, never edit someone else's block:

```markdown
## 2026-08-19T1403Z · claude · T-003
@cursor — token refresh done, `src/auth/*` released. The `+email` 500 is B-004, still open,
I did not touch it. Blocking on: nothing.
---
```

Use it when another agent must know something to act: you released a claim they were waiting on, you found a bug in their scope, you need a decision. Findings and reasoning go in your log; the thread is for things addressed to someone.

### `.agent/log/<UTC>-<agent>[-<session8>].md`

Filename sorts chronologically: `2026-08-19T1403Z-claude-82df4726.md` — timestamp, tool, then the first 8 characters of the session id if the tool has one.

<!-- godkit:log-frontmatter -->

```markdown
---
agent: ""             # the MODEL that ran, not the tool: claude-opus-5, codex-5.6-terra,
                      # gemini-3.6-pro. `godkit verify` rejects a bare "claude" or "codex".
session: ""           # the host's session id; the filename carries its first 8 characters
started: ""
ended: ""             # UTC, e.g. 2026-08-19T1403Z
scope: ""             # file globs you actually touched
status: "done"        # done | partial | blocked
skills: ""            # .agent/skills/ skills you used, comma-separated. Empty is fine.
---
```

<!-- /godkit:log-frontmatter -->

A real one, filled in:

```markdown
---
agent: "claude-opus-5"
session: "82df4726"
started: "2026-08-19T1340Z"
ended: "2026-08-19T1403Z"
scope: "src/auth/*"
status: "done"
skills: "refresh-fixture-db"
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

Sections may be empty. **"Left / next" may not be empty when status is `partial` or `blocked`** — that section is the entire reason the next agent can start.
