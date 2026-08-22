# Godkit

**One shared harness for every AI agent.** Claude Code, Cursor, Codex and Antigravity all point at the same repo — so give them the same memory, the same board, and the same rules.

```bash
npx godkit init
```

---

## The problem

Every agent arrives blind. It does not know what the project is, what was already done, which file someone else is holding, or what was decided last week. So work gets redone, two agents edit the same file, and every session starts by re-reading the codebase from scratch.

Private memory does not fix this: Cursor cannot read Claude's memory directory, and Claude cannot read Cursor's. **The only shared memory between tools is the filesystem they both open.**

## What Godkit does

It puts one committed directory in your repo, and teaches every agent to use it.

```
.agent/
├── BOARD.md              roster · claims · task index · bugs · decisions — one screen
├── THREAD.md             append-only conversation between agents
├── MAP.md                what this codebase is (generated)
├── graph.json            the machine-readable map
├── tasks/T-001-*.md      one per task: Plan · Execute · Review · Test · Handoff
└── log/<UTC>-<agent>.md  one per session, append-only, never edited by others
```

Two rules, enforced everywhere:

> **Read `.agent/` before you edit. Write your log before you finish.**

An agent arriving at a project reads the board and the map, claims a scope, writes its tasks out as files, and leaves a log the next agent can resume from. Overlapping claims stop it before it edits. On Claude Code, a Stop hook blocks the turn until the log exists.

Append-only everywhere is deliberate: one log file per session means two tools writing at the same moment never conflict, and git merges them without a thought.

## Install

```bash
npm install -g godkit

godkit install          # skills -> claude, codex, antigravity
godkit init             # scaffold .agent/ + rule files into the current repo
godkit doctor           # what is set up, and whether the map is stale
```

| Tool | Skills | Always-on rules | Hooks |
|---|---|---|---|
| **Claude Code** | `~/.claude/skills/` | `CLAUDE.md` | yes |
| **Cursor** | — | `.cursor/rules/godkit.mdc` | not supported |
| **Codex** | `~/.agents/skills/` | `AGENTS.md` | yes |
| **Antigravity** | `~/.gemini/antigravity/skills/godkit` | `.agents/rules/godkit.md` | not supported |

`godkit install` places the skills once per machine; `godkit init` writes the rule files once per project. Every rule file is generated from a single `AGENTS.md`, so they cannot drift apart — CI byte-compares them.

Where a tool has no hook support, the always-on rule file *is* the enforcement. That is why they all say the same thing.

### Hooks (Claude Code, Codex)

```bash
node hooks/install.js                  # ~/.claude/settings.json
node hooks/install.js --uninstall
```

Re-running is safe: it drops its own previous entries first, leaves other tools' hooks alone, and writes a `.bak`. If it cannot parse your settings file it changes nothing and says so.

| Hook | Does |
|---|---|
| `SessionStart` | injects the board, map freshness, and the newest log entries |
| `Stop` | blocks the turn if files changed and no log was written |
| `PostToolUse` (Bash) | after a commit or merge, says if the map went stale |

## The project map

`godkit-map` builds a graph of the codebase into `.agent/graph.json`, with a readable `.agent/MAP.md` projection. The deterministic half is a script — walk, categorize, resolve imports, group files that import each other into the same batch:

```bash
godkit scan
```

The judgment half is the model: what each thing is *for*, how the layers actually divide, and where the landmines are.

**Recall is grep, not load.** Node ids are `type:path[:name]`, so finding a concept and then its one-hop neighbourhood costs two greps and no context:

```bash
rg '"summary"' .agent/graph.json | rg -i token
rg 'function:src/auth/token.ts:isExpired' .agent/graph.json    # every caller
```

Refreshes are incremental. The map records the commit it was built at; the classifier decides how much to redo — `SKIP`, `PARTIAL`, `ARCHITECTURE` or `FULL` — so a two-file change never triggers a full rebuild.

A file's structural signature is derived from the graph itself rather than a second store, which means the two can never disagree. The save path also refuses to overwrite a graph it could not read, so one bad parse cannot quietly reset your project's memory.

## Skills

| Skill | Use for |
|---|---|
| `godkit` | arriving at a project, synthesizing and splitting the work |
| `godkit-map` | building or refreshing the project map |
| `godkit-handoff` | the `.agent/` protocol and its file formats |
| `godkit-plan` | cutting seams, assigning owners, writing task files |
| `godkit-execute` | running work through the pipeline, error recovery |
| `godkit-review` | reviewing the process, or diagnosing a failed run |
| `godkit-test` | what counts as verified, writing the check |
| `godkit-lazy` | what to build and what to skip |
| `godkit-help` | quick reference card |

## Design

- **Zero runtime dependencies.** Node standard library only, in the package and in the tests.
- **One source of truth per fact.** `AGENTS.md` generates every rule file. `graph.json` generates `MAP.md` and its own freshness signatures.
- **Hooks never throw.** Malformed input, missing git, absent `.agent/` — all exit 0. A broken hook must not break the session it was meant to help.
- **Nothing absolute is ever committed.** Paths in the graph are sanitized to the project root, so no machine layout or username ships in your repo.
- **Deliberate shortcuts are marked** with a `godkit:` comment naming the ceiling and the upgrade path. An unmarked shortcut is indistinguishable from a mistake.

## Development

```bash
npm test                          # node:test, no framework
node scripts/sync-rules.js        # regenerate the rule copies
node scripts/sync-rules.js --check
```

## License

MIT © [CodeForFee](https://github.com/CodeForFee)
