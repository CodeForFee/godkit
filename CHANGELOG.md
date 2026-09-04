# Changelog

All notable changes to godkit. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-09-05

First public release.

### Install

- `npx @codeforfee/godkit init` is the whole install. It scaffolds `.agent/` and the per-tool rule files into the project and, the first time only, places the skills and registers the hooks on this machine. A machine already set up is left alone, so running `init` in your next repo touches nothing outside it. `--no-install` does the project half only.
- `godkit init --new` for a project with no code yet: no map is built, because there is nothing to map. You get `.agent/BRIEF.md` — what this is, who for, the stack, and the non-goals — and the first sprint is cut from that.
- `godkit --version`.

### Sprints

- `godkit sprint new "<goal>"` opens `.agent/sprints/S-NNN.md`; `godkit sprint` reports what is in the current one; `godkit sprint close` refuses while any task it names is unfinished, unwritten, or finished with an empty `## Test`.
- A sprint is a goal plus waves of **file-disjoint** tasks behind a join gate. The CLI owns only what a machine can decide — creating the file and checking the tasks. Cutting the waves stays with the model, the same split `scan`/`save` has with the map.

### Identity

- An agent is identified by its **model**, never its tool: `claude-opus-5`, not `claude`. One tool runs many models with different costs and failure modes, and an agent reading someone else's unproven claim needs to know which one made it.
- `godkit verify` rejects a bare tool name in a log's `agent:` or a started task's `owner:`. Enforced by shape, not by a shipped allowlist of known model ids — an allowlist goes stale within a quarter and then rejects the truth.
- `unrecorded` is the one honest value for entries written before this rule. Back-filling a guess would put a fabricated attribution into a permanent record.

### The protocol

- `.agent/` as committed, tool-neutral shared state: `BOARD.md` (roster, claims, task index, bugs, binding decisions), `THREAD.md` (append-only conversation between agents), `tasks/` (one file per task, carrying Plan · Execute · Review · Test · Handoff) and `log/` (one append-only entry per session).
- Two enforced rules: read `.agent/` before you edit, write your log before you finish.
- One log file per session, so two tools writing at the same moment never conflict. The generated map files are marked `-merge` instead, because a textual merge there produces unparseable JSON.

### Skills and hosts

- Sixteen skills, identical in every project, covering arrival and coordination, doing the work, and judging it afterwards.
- Claude Code, Codex, Cursor and Antigravity, each from one canonical `AGENTS.md`. Every rule file is generated from it and byte-compared in CI, so they cannot drift apart.
- Also installable on Claude Code as a plugin, via the marketplace manifest.
- Project-local skills in `.agent/skills/`: committed, inert until linked, and linked as owned snapshots that never overwrite a file you put at that path yourself.

### The project map

- `godkit scan` / `godkit save` build `.agent/graph.json` with a readable `MAP.md` projection. Refreshes are incremental against the commit the map was built at.
- Node ids are greppable (`type:path:name`), so recall costs two greps and no context.
- Paths are sanitized to the project root — no machine layout or username is ever committed.

### Evidence and evolution

- `godkit evolve` derives what each project skill's evidence says from the log stream alone, with no second store to go stale. Trust is a usage/outcome correlation and says so on every run, including how many log entries it could not attribute.
- `godkit refactor` ranks code files by churn and blame from the same log stream, cross-referenced against the map for fan-in.

### Hooks

- Seven hooks on Claude Code and Codex: session brief, lazy-mode resolution for sessions and subagents, work tracking, clock-out enforcement, and map staleness after a commit.
- `godkit hooks install` drops its own previous entries, writes a `.bak`, and leaves other tools' hooks alone even when they share a group. Unparseable settings change nothing and say so.
- Hooks never throw. Malformed input, missing git, absent `.agent/` — all exit 0.

### Safety

- Zero runtime dependencies, Node 18+.
- `install` and `uninstall` only ever touch what godkit created; a destination it does not own is refused, never replaced.
- `init` writes into a marked block and preserves everything outside it; an ambiguous hand-edited marker is refused rather than guessed at.
- Generated skills do not link under the default `audit_only` mode, and `--force` overrides the mode but never a safety block.

[1.0.0]: https://github.com/CodeForFee/godkit/releases/tag/v1.0.0
