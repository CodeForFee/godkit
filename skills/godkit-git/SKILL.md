---
name: godkit-git
description: >
  Git mechanics for a repo several agents edit at once: worktrees as the technical backstop for
  a board claim, commit as the actual checkpoint mechanism, and why .agent/ itself rarely
  conflicts. Use when starting real parallel work (rung 5 of the split-work ladder), when
  deciding how to record a verified step, when a merge touches .agent/, or when the user says
  "worktree", "parallel branches", "merge conflict in the board", "how do we commit this".
  Do NOT use for release mechanics — versioning, changelogs, tagging are a different concern.
license: MIT
---

# Git

A board claim is a promise. A worktree is what makes breaking it impossible instead of just rude.

## Worktrees for real parallelism

Once two agents are both mid-edit on disjoint file sets (split-work rung 5), a shared working
directory means one agent's half-finished edit is sitting in the other's view the whole time.
A worktree removes that:

```
git worktree add ../<repo>-<seam> <branch>
```

One per concurrently-claimed seam. Each agent gets its own working directory on its own branch;
neither can see the other's uncommitted diff, because there is no shared uncommitted diff to see.
The board claim still says who owns what — the worktree is the mechanism that makes violating it
impossible, not the thing that decides ownership.

Land the branches through the same join gate **godkit-plan** already calls for: merge, then one
agent runs the full check suite.

## Commit as the checkpoint

**godkit-execute** stage 5 says to record a meaningful step. The recording mechanism is a commit:

- commit `.agent/` (the log entry, the task file, the released or updated claim) together with
  the code it describes — not `.agent/` in one commit and the code in another, and not deferred
  to end-of-session
- a bad next step then reverts to a save point instead of a hand-unwind. "Undo the last twenty
  minutes" is `git reset` to a known-good commit; without one, it is you reconstructing the
  diff from memory
- small, frequent commits after each verified step beat one large commit at the end — the
  checkpoint is only useful if it exists before the thing that might need reverting

## Why .agent/ rarely conflicts, and what to do when it does

The file layout in **godkit-handoff** is deliberately merge-friendly:

| File | Conflict frequency | Why |
|---|---|---|
| `log/<UTC>-<agent>.md` | never | one file per session, nobody else writes it |
| `tasks/T-NNN-*.md` | rare | one file per task; two agents on the same task is already a `godkit-handoff` clock-in violation |
| `BOARD.md` | occasional | append-heavy by convention (new claim rows, new decision lines) — a conflict is almost always both sides adding a different line, which is a trivial union |
| `THREAD.md` | occasional | append-only, newest at the bottom — same trivial-union shape |

A real disagreement — two agents wanting different things recorded as the *same* decision, or
conflicting claims on the same file — is not a merge-tool problem. Resolve it in `THREAD.md` where
a reader will see it, never by silently picking one side during the merge.

## Boundaries

This skill is the git mechanism only. It does not decide *what* to parallelize — that is
**godkit-plan**. It does not decide *when* a step is worth checkpointing — that is
**godkit-execute** stage 5; this skill is what "checkpoint" turns into on disk. Semantic
versioning, changelogs, release tagging and commit-message taxonomies are release hygiene, not
covered here.
