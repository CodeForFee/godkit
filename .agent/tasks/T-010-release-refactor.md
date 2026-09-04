---
id: T-010
title: public release prep and the refactor seam
owner: unrecorded     # predates the model-id rule; not back-filled
scope: lib/hotspots.js, bin/godkit.js, lib/evolve.js, skills/godkit-refactor/*, skills/godkit-evolve/SKILL.md, skills/godkit-help/SKILL.md, commands/godkit-refactor.toml, tests/hotspots.test.js, tests/graph.test.js, README.md, CHANGELOG.md, .gitignore
exit: npm test green, `godkit refactor` prints a ranked table, `godkit doctor` reports 15 skills and a current map, main fast-forwarded and pushed
phase: done
created: 2026-08-26T0503Z
---

## Plan

Two things in one seam, because they land in the same files and the same release.

**The semantic split.** `godkit-evolve` evolves *skills*; nothing about it evolves source code.
That reading is not obvious from the name, and it cost a real misunderstanding. Fix by keeping
evolve exactly as it is and adding `godkit-refactor` next to it for the source-code half, with
both `## Boundaries` sections pointing at each other.

`godkit-refactor` follows the split `godkit-map` already established and README already explains:
a script does the deterministic half, the model does the judgment half.

The deterministic half needs no new parsing. Three signals already live in the log format, and
`lib/evolve.js` already reads all three:

| signal | source | reader |
|---|---|---|
| files claimed | `scope:` frontmatter | `readLogSignals()` — lib/evolve.js:724 |
| files actually changed | `## Did` bullets, `path/to/file.js:88` | `section()` / `bullets()` — lib/evolve.js:699, :715 |
| files that were a root cause | `## Bugs` bullets | already on the record |
| blast radius | fan-in over `edges[].target` | .agent/graph.json |

One line added to `readLogSignals()` keeps raw `scope` on the record. `taskTokens` is computed
exactly as before, so `godkit evolve` does not change.

**The release.** 25 commits sat unmerged on `godkit/skill-evidence` while `main` — and therefore
the public repo — still showed the pre-hardening state. Fast-forward, push, then tag.

Ordered: settle the working tree, build the seam, fix the docs, then merge and push.

## Execute

**Working tree settled.** `hooks/brief.js` was carrying `require('../lib/frontmatter')` against an
untracked `lib/frontmatter.js`, left over from removing the watch dashboard. `npm pack` bundles
untracked files, so a publish from that machine would have worked while CI's clean checkout
crashed every user's `SessionStart`. `lib/monitor.js` was gone with the dashboard, leaving one
consumer and two dead exports, so both were reverted rather than committed.

**The seam.**

- `lib/evolve.js:745` — `readLogSignals()` now keeps `scope` raw and adds `did`. `taskTokens` is
  computed exactly as before, so `godkit evolve` is byte-identical in behaviour.
- `lib/hotspots.js` — new, 121 lines. Ranks code files by `blamed x2 + touched` over the log
  stream, annotated with fan-in from `.agent/graph.json`. The map is the file universe, which is
  what makes path-shaped prose unscoreable; glob claims are expanded against it. Ranking formula
  carries a `godkit:` comment naming its ceiling.
- `bin/godkit.js:475` — `cmdRefactor`, plus the `HELP` line and the dispatch case.
- `skills/godkit-refactor/SKILL.md` — new. The judgment half: how to read the four columns
  against each other, when the answer is "nothing is wrong here", and the claim/root-cause/test
  discipline for when you do cut.
- `commands/godkit-refactor.toml` — required; one command per skill is a contract test.
- `skills/godkit-evolve/SKILL.md` — description and Boundaries now say it evolves procedures and
  point at godkit-refactor for code. That sentence is the whole reason this task exists.

**B-011, found mid-task.** `.agent/MAP.md` rendered `1. **** — ` eight times: the architect pass
had emitted the tour as empty shells and every layer with `nodeIds: []`, and nothing downstream
refuses an empty tour. The public repo was showing it. Claim widened to `.agent/graph.json` and
`.agent/MAP.md` before touching them. Rewrote the tour as eight real entries and derived layer
membership from the graph — all 169 nodes placed, 0 unplaced. `renderMap` in `lib/graph.js` was
correct and was left alone.

**Release polish.** Plugin-marketplace install and `docs/agent-portability.md` linked from the
README; the `agents/` prompts documented for the first time; `CHANGELOG.md` written and added to
the `files` allowlist; `tests/graph.test.js:42` no longer carries the maintainer's real Windows
username; `.worktrees/` ignored.

## Review

- The `scope`/`did` addition is additive on a record literal — no existing caller reads by
  position, and `godkit evolve` output was unchanged before and after.
- `lib/hotspots.js` reaches into `lib/evolve.js` rather than re-reading the log stream. That is
  the right direction: evolve.js already documents at `readLogSignals` that reading the logs
  twice was the biggest cost in the module.
- Docs-are-ranked-out is a real judgment call, not a tidy-up: `README.md` scored 7 and outranked
  every source file, and there is no refactor at the end of that row. Asserted in a test so it
  cannot be silently reverted.
- Left alone deliberately: `renderMap` does not reject an empty tour. Guarding there would make
  a bad architect pass silent instead of visible. B-011 was data, and is fixed as data.

## Test

```
npm test
ℹ tests 167 · pass 166 · fail 0 · skipped 1     (skip = symlink privileges, tests/runtime.test.js:84)

node --test tests/hotspots.test.js
✔ a file blamed as a root cause outranks one that was only touched
✔ a glob claim counts for every file it names
✔ path-shaped prose that names no real file scores nothing
✔ docs are ranked out — there is no refactor at the end of a README row
✔ no map is reported, not silently rendered as a clean codebase
✔ fan-in counts the files that depend on this one, not its own internals
ℹ pass 6 · fail 0

node bin/godkit.js refactor
  score  file                              touched  blamed  sessions  fan-in
  6      bin/godkit.js                     4        1       3         3
  6      hooks/install.js                  4        1       4         1
  5      tests/package.test.js             5        0       3         8

node bin/godkit.js doctor
  skills in package: 15

npm pack --dry-run
  total files: 81      lib/hotspots.js present, lib/frontmatter.js absent
```

## Handoff

- Not published and not tagged. `.github/workflows/publish.yml` uses OIDC trusted publishing with
  no `NODE_AUTH_TOKEN`, so npmjs.com must have `CodeForFee/godkit` + `publish.yml` registered as a
  trusted publisher **before** a `v1.0.0` tag is pushed, or the release job fails at the last step.
  `godkit` was free on the registry (404) as of this session — unclaimed means claimable by anyone.
- The map is stamped at the commit before this one. After this lands, re-run `godkit save` and
  commit the refresh separately, which is the pattern the earlier sessions used.
- This machine still has 3 of 10 hooks registered from an older install. `godkit hooks install`
  fixes it; still nobody's mandate to write real home config.
