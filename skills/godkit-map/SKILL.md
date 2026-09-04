---
name: godkit-map
description: >
  Build or refresh the project map — .agent/graph.json plus a readable MAP.md — so every agent
  arriving later knows the architecture, entry points and landmines without re-reading the repo.
  Scans, analyzes in batches, derives layers and a start-here tour, saves incrementally. Use when
  there is no map, when it reports STALE, after a large merge or refactor, or on "map this",
  "index this", "understand this codebase", "what is this project", "refresh the map". Do NOT use
  to answer what the existing map already answers — grep it.
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

### 5. Save

Write the merged graph — nodes, edges, layers, tour, project — to `.agent/tmp/graph-merged.json`, then:

```
godkit save
```

That one command does the rest, and does it in the order that makes an interrupted run safe:

1. normalizes and writes `.agent/graph.json` — dedupes ids, drops dangling edges, sanitizes paths
2. generates `.agent/MAP.md` from it
3. writes `.agent/meta.json` **last**, carrying the commit sha

`meta.json` last means a crash halfway through reads as stale on the next arrival rather than being trusted as complete. It then moves `.agent/tmp/` to `.agent/.trash-<epoch>` instead of deleting it, and purges trash older than seven days — a move is reversible and never trips a destructive-action gate.

**Do not write these three files by hand.** `MAP.md` is generated, and the save path carries the guards that keep the graph consistent.

## Refreshing incrementally

`godkit save` is already **load, patch, save**: it keeps every node whose file you did not re-analyze, replaces the ones you did, and preserves the existing layers and tour unless your merged graph supplies new ones. So for a `PARTIAL` refresh you write **only the changed files' nodes** to `graph-merged.json` and save normally.

This matters because the alternative fails silently. Writing only the fresh entries over the whole file discards every other file's nodes; the next refresh then sees those files as new, escalates, and the map is stuck rebuilding from scratch forever. The load path refuses to report an existing non-empty file as empty precisely so that cannot happen quietly — **if it throws, fix the file; never delete it to make the error go away.**

Use `godkit save --replace` only for a genuine `FULL` rebuild, where discarding the old graph is the intent.

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
