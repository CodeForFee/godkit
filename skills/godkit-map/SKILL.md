---
name: godkit-map
description: >
  Build or refresh the project map — a durable, committed description of what a codebase is,
  stored as .agent/graph.json with a readable .agent/MAP.md projection, so every agent that
  arrives later knows the architecture, the entry points and the landmines without re-reading
  the repo. Runs a scan, groups files into batches, analyzes them into nodes and edges, derives
  the architecture layers and a start-here tour, then saves. Refreshes incrementally: only what
  changed gets re-analyzed. Use when there is no map yet, when the map reports STALE, after a
  large merge or refactor, when onboarding onto an unfamiliar repo, or when the user says
  "map this", "index this", "understand this codebase", "what is this project", "refresh the
  map", "build the graph". Do NOT use to answer a question the existing map already answers —
  grep it instead.
argument-hint: "[--full | --refresh]"
license: MIT
---

# Map

The map is what lets the next agent skip the hour you just spent working out how this repo fits together. It is committed, so it is shared; it is generated, so it can be rebuilt; it is graph-shaped, so it can be queried without being read whole.

**A stale map is worse than no map.** No map makes an agent read the code. A stale one makes it act confidently on something that is no longer true. Refresh before you rely on it.

## Reading the map — do this before building anything

Most questions are answered by the existing map, for free. **Grep it, never load it whole:**

```
rg '"name"'    .agent/graph.json | rg -i auth     # find the concept
rg '"summary"' .agent/graph.json | rg -i token    # or by description
rg 'function:src/auth/token.ts'   .agent/graph.json   # then the id, in "edges", for 1-hop
```

Node ids are `type:path[:name]` — `file:src/auth/token.ts`, `function:src/auth/token.ts:isExpired`. Grepping an id in the `edges` array gives you everything that calls it, imports it, or is tested by it. That is usually the whole answer, without opening a source file.

`.agent/MAP.md` is the human-readable projection: architecture layers, key files, and a start-here tour. Read it on arrival; grep the graph when you need precision.

## Building it

### 0. Decide how much to do

```
godkit doctor           # is there a map, and is it stale?
```

| Situation | Do |
|---|---|
| no map | full build, below |
| `SKIP` | nothing changed — stop, you are done |
| `PARTIAL` | re-analyze only the changed files, patch them into the graph |
| `ARCHITECTURE` | re-analyze changed files, then redo layers and tour (step 4) |
| `FULL` | start over |

Never do more than the classifier asks. A full rebuild of a repo where two files moved is pure waste.

### 1. Scan

```
godkit scan
```

Walks the project honouring `.agent/.agentignore` and `.gitignore`, categorizes every file, resolves internal imports, and groups everything into token-budgeted batches — files that import each other land in the same batch, because a summary written without the caller in view is a guess.

Writes `.agent/tmp/scan.json` and `.agent/tmp/batches.json`. This step is deterministic and costs no tokens.

### 2. Analyze each batch

For each batch in `batches.json`, read its files and emit nodes and edges. Delegate to the `file-analyzer` agent when the batch count makes it worth a spawn — up to about five at a time, each writing `.agent/tmp/batch-<index>.json`. For a small repo, just do it in this turn; a spawn costs a cold start.

The contract for what a node and an edge must contain is in `agents/file-analyzer.md`. Two rules matter most:

- **Ids are `type:path[:name]`, using the path exactly as `scan.json` gives it.** Ids are identity — a mistyped path silently creates a second node for the same thing.
- **Summaries say what it is *for*, not what it is called.** "Validates and refreshes auth tokens; the expiry comparison here is the one every caller depends on" earns its place. "Token function" does not.

### 3. Merge

Combine every `batch-*.json` into one graph. Ids dedupe, `(source, target, type)` dedupes edges, and edges pointing at a node that does not exist are dropped — a dangling edge is a claim about something that was never found.

### 4. Architecture and tour

With the whole node set in view, derive:

- **`layers[]`** — the real structural grouping of this project, in its own vocabulary. Not "model / view / controller" unless that is genuinely what it is.
- **`tour[]`** — an ordered start-here path for someone who has never seen the repo. Five to nine steps. The first step is where execution actually begins.

See `agents/architect.md`.

### 5. Validate and save

Before writing, check: every edge endpoint exists, every layer references real nodes, no node has an empty summary, no absolute paths. Then save — in this order, because the order is the crash-safety:

1. `.agent/graph.json`
2. `.agent/MAP.md` (generated from the graph — never hand-edited)
3. `.agent/meta.json` last, carrying the commit sha

`meta.json` written last means an interrupted run is detected as stale on the next arrival, rather than being trusted as complete.

Then move `.agent/tmp/` scratch to `.agent/.trash-<epoch>` rather than deleting it, and purge trash older than seven days. A move is reversible and never trips a destructive-action gate.

## Refreshing incrementally

`PARTIAL` and `ARCHITECTURE` refreshes must **load, patch, save** — never write only what you just computed.

Writing only the fresh entries discards every other file's nodes. The next refresh then sees those files as new, escalates, and the map is stuck rebuilding from scratch forever. The load path refuses to report an existing non-empty file as empty precisely so this cannot happen quietly — if it throws, fix the file, do not delete it to make the error go away.

To patch: drop every node whose `filePath` is in the changed set, drop every edge touching those nodes, then merge the new batch output in.

## Rules

- **Do not map what the repo already says.** A node per file is useful; a node per getter is noise that makes the graph unusable.
- **Never hand-edit `MAP.md`.** It is generated; the next refresh overwrites it. Fix the graph.
- **Do not invent structure.** If a project has no clean layering, say so in the description. A tidy map of a messy repo is a lie that costs the next agent an afternoon.
- **Record the gotchas.** The map's real value is the landmine that took you an hour to find — the surprising coupling, the file that looks dead and is not.
- **Absolute paths never enter the graph.** It is committed and pushed; a path leaks the machine layout and the user's name.
- Mark deliberate mapping shortcuts with a `godkit:` comment naming the ceiling.

## Output

```
mapped: 214 files -> 380 nodes, 612 edges, 7 layers. verified: all edges resolve.
saved: .agent/graph.json, MAP.md, meta.json @ a1b2c3d.
```

On a refresh, say what changed instead: `refreshed: PARTIAL, 3 files -> 11 nodes replaced.`

## Boundaries

This skill owns what the codebase *is*. It does not track who is working on what (**godkit-handoff**), and it does not decide what to build (**godkit-plan**). It describes; it never edits source.
