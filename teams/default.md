---
name: default
description: A leader runs plan, then code in parallel waves of file-disjoint seams, then test, then review, and sends the work back on a failure.
plan: godkit-planner
code: godkit-implementer
test: godkit-tester
review: godkit-reviewer
parallel: 4
rounds: 2
---
# The team

```
                    ┌─────────────────────────┐
     goal ─────────►│  leader (godkit team)   │  owns the graph below; never edits code itself
                    └────────────┬────────────┘
                                 ▼
                         ┌──────────────┐
                         │     plan     │  godkit-planner · read-only
                         └──────┬───────┘   seams: { task, files, after } + one check command
                                ▼
        ┌──────────────── wave 1 (in parallel) ───────────────┐
        │  code S1        code S2        code S3   ...        │  godkit-implementer · one per seam,
        └────────────────────────┬────────────────────────────┘  each in its own worktree, at most
                                 ▼   merge                        `parallel` at once
                         wave 2, wave 3 ...                       (seams whose files overlap wait)
                                 ▼
                         ┌──────────────┐
                         │     test     │  godkit-tester · runs the check, adds a missing test
                         └──────┬───────┘   PASS / FAIL
                                ▼
                         ┌──────────────┐
                         │    review    │  godkit-reviewer · read-only
                         └──────┬───────┘   APPROVE / CHANGES
                                │
              FAIL or CHANGES ──┴──► code (fix) ──► test ──► review     at most `rounds` times
                                │
                                ▼
                   branch godkit/team-<id>, for you to review and merge
```

## Roles

| Role | Agent | Skills it preloads (from its file) |
|:--|:--|:--|
| plan | `godkit-planner` | godkit-plan, godkit-map, godkit-lazy, godkit-doubt, godkit-handoff, godkit-git |
| code | `godkit-implementer` | godkit-execute, godkit-lazy, godkit-test, godkit-output-enforcement, godkit-git, godkit-handoff |
| test | `godkit-tester` | godkit-test, godkit-execute, godkit-lazy, godkit-output-enforcement |
| review | `godkit-reviewer` | godkit-review, godkit-test, godkit-doubt, godkit-refactor, godkit-lazy |

On top of those, every run adds `godkit-frontend` to plan, code and review when the goal is about
UI, and every project skill in `.agent/skills/` that `godkit evolve` rates **trusted**.

## Changing the team

Copy this file to `.agent/team.md` and edit it. The keys:

- `plan`, `code`, `test`, `review`: which agent fills each role (any agent `godkit agent list` shows,
  including your own in `.claude/agents/` or `.agent/agents/`).
- `<role>-skills`: more skills for one role, e.g. `review-skills: godkit-triage`.
- `parallel`: how many implementers run at once (1 to 8).
- `rounds`: how many times a failed test or review sends the work back (0 to 5).
