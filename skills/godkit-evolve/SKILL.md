---
name: godkit-evolve
description: >
  Write and maintain this project's own skills in .agent/skills/: capture a procedure the logs show
  repeating, narrow an existing one, or fix one that led to a failure. Use when the same shaped job
  appears in three or more log entries, when `godkit skills` reports one demoted or blocked, or on
  "capture this", "make this a skill", "we keep doing this by hand". Evolves PROCEDURES — for
  source code use godkit-refactor. Do NOT use for the skills this package ships, for deciding what
  to do next (godkit-plan), or for whether work is verified (godkit-test).
license: MIT
---

# Evolve

A project accumulates procedures — the fixture reset, the release check, the migration dance.
Written down once, they stop living in nobody's head twice. `.agent/skills/` is where they go.

Package skills ship with godkit and are the same in every project. **Project skills belong to
this repo**, are committed with it, and are linked into the paths Claude Code and Codex read.

## Before writing anything

Read `.agent/SKILLS.md` if it exists, and run:

```
godkit skills
```

A skill that already covers the job means you are about to write a duplicate. A skill that
covers it *badly* is a **fix**, not a new skill.

## The three kinds

| Kind | When | Frontmatter |
|---|---|---|
| **captured** | the logs show the same shaped job done three or more times | `origin: captured` |
| **derived** | an existing skill is right except in one narrower context | `origin: derived`, `parent: <name>` |
| **fix** | a skill led to a failure and the instruction that misled is identifiable | `origin: fix` on first repair, then bump `revised:` |

### Captured

Trigger: three or more log entries doing the same shaped job. Read the actual entries — the
detection is deliberately high-recall, so **most candidates should be rejected**.

The test is not "did this happen three times". It is **"is there a repeatable procedure here"**.
Three bug fixes in the same file are not a procedure. Three runs of the same six-step release
dance are. If what repeats is the *subject* rather than the *steps*, say so and stop.

Write the steps that were actually taken, from the logs, with the real commands and real paths.
A captured skill that generalizes away the specifics is a worse version of the general skill it
duplicates.

### Derived

Never automatic. Someone has to say "this is right except when X".

The child's `description` must name the narrower trigger — that string is how a host decides
between parent and child, so "like the parent but for monorepos" is useless and "when the repo
has multiple package.json files" works. The child's `## Boundaries` must say **when to use the
parent instead**.

### Fix

`godkit skills` names the skill and the logs that blamed it. Read those entries, find the
instruction that actually misled — not the step where the symptom appeared — then:

1. Edit the instruction.
2. Bump `revised:` to now. **This resets the evidence window**: the skill is judged on its
   current text, not on what its ancestor did.
3. Add a `## Changelog` line saying what changed and why, naming the `B-NNN` if there is one.
4. Re-run `godkit skills --link`.

## The file

`.agent/skills/<name>/SKILL.md`. The directory name and the frontmatter `name` must match.

```yaml
---
name: refresh-fixture-db
description: >
  Reset the seeded Postgres fixture between integration suites. Use when a suite fails on
  leftover rows, or before a run that must start clean.
license: MIT
origin: captured
created: 2026-08-22T1140Z
revised: 2026-08-22T1140Z
enabled: true
---
```

`name`, `description` and `license` are what the host reads. The rest is godkit's.

`origin` and `enabled` are **required**, and must be one of `authored`, `captured`, `derived`,
`fix` and one of `true`, `false`. A SKILL.md missing them, or carrying frontmatter godkit cannot
parse, is reported as a blocking finding and will not link — an unreadable declaration is not a
safe default to guess at.

**The `description` is the whole retrieval mechanism.** No index, no embeddings — a host decides
whether to load a skill by reading that string. Name the trigger, not the topic: "use when a
suite fails on leftover rows" beats "database utilities".

Then the body: the steps, the real commands, and a mandatory `## Boundaries` section saying what
the skill does not cover.

## Rules

- **No bundled executables.** A project skill is instructions. Hosts offer to run scripts a skill
  ships, which turns a markdown file into an execution vector — the safety scan blocks it.
- **No secrets, no tokens, no absolute machine paths.** This file is committed.
- **Write it from the logs, not from memory.** The logs have the real commands with their real
  output; your recollection of the session does not.
- **Reject more than you write.** A wrong skill auto-loaded into a future agent's context is
  worse than no skill, because it will be trusted.

## Modes

`GODKIT_EVOLVE_MODE`, or `evolveMode` in godkit's config file. Default **`audit_only`**.

| Mode | You may |
|---|---|
| `audit_only` | propose in chat; write a skill file only when asked. Captured and derived skills stay inert — they exist in `.agent/skills/` but `godkit skills --link` refuses them |
| `fix_only` | repair existing skills without asking; no new ones |
| `autonomous` | create captured and derived skills without asking |

The gate is mechanical, at the link step, not a promise made here. In `audit_only` a captured
skill is a committed markdown file nobody's host can load — reviewable, and harmless.

## What "trusted" means, exactly

```
godkit evolve            # what the logs say about each skill
godkit evolve --write    # project it to .agent/SKILLS.md
```

| | |
|---|---|
| **trusted** | 3 successes across 3 *distinct* sessions, no failures |
| **provisional** | the default, and where a trusted skill lands after one attributable failure |
| **quarantined** | 2 failures, a blocking safety finding, or `enabled: false` — will not link, even with `--force` |

A **success** is a log entry that lists the skill, has `status: done`, and has at least one
`## Verified` bullet. A **failure** is a `## Bugs` bullet naming the skill, or a `status: blocked`
entry that lists exactly one skill. A blocked entry listing three skills blames **none** of them.

Read the level precisely:

> **used repeatedly, and the sessions that used it finished verified.**

It is a usage/outcome correlation, self-reported in log frontmatter by the same agent that used
the skill. It is **not** a quality measure, and self-reports skew positive. A `trusted` skill can
still be wrong. Read the skill.

Demotion is asymmetric on purpose — three sessions up, one failure down — because a wrong
instruction auto-loaded into an agent's context costs more than a slow promotion does.

**Fixing a quarantined skill resets its window.** Edit the text, bump `revised:` to now, and the
old failures no longer count: you are being judged on the text that exists, not its ancestor.

## Boundaries

This skill evolves **procedures**: it writes and repairs skills in `.agent/skills/`. It never
changes source code — that is **godkit-refactor**, which reads the same log stream and ranks the
files it names instead of the jobs it repeats. Same evidence, two different things to evolve;
if you came here to improve the code, you want that one.

It does not edit the skills this package ships. It does not decide what work to do
(**godkit-plan**), judge whether work is verified (**godkit-test**), or diagnose why a run went
wrong (**godkit-review**) — though a `godkit-review` finding is often what tells you a skill
needs fixing.
