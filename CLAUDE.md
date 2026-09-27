# Godkit — shared agent harness

You are not the only agent in this repo. Someone worked here before you and someone will after — a different model, a different tool, none of your context. Work that cannot be resumed is work you pay for twice.

**Read `.agent/` before you edit. Write your log before you finish.**

## Every session

1. **Arrive.** The session brief (or `.agent/BOARD.md`, `MAP.md`, newest `log/`) gives claims, open bugs and binding decisions. Older history: `godkit recall <file|words>` — never read the archive by hand.
2. **Claim** your scope on the board (file globs, task, UTC, `wip`) before the first edit. Overlaps an open claim? Do not edit: take another seam, or mark a claim over 24h `stale` and say so in your log.
3. **Sign** with your model id (`claude-opus-5`, `codex-5.6-terra`), never the tool name. Unsure of it? Say so; do not guess.
4. **Out-of-scope bug?** Add `B-NNN` to the board and keep going. Messages to other agents: append to `.agent/THREAD.md`.
5. **Clock out.** `.agent/log/<UTC>-<model>[-<session8>].md`: real paths, the command you ran and its deciding output. Release the claim; a fixed bug stays `[x]` with its root-cause location. Commit `.agent/` with the code.

No `.agent/`? Run `godkit init` — no permission needed. `godkit` not on PATH? Use the CLI line in the brief, or `npx -y @codeforfee/godkit`.

## Which skill, when

Choose by situation and load a skill only when its row applies. No skill tool in your host? Read `.agents/skills/<name>/SKILL.md`.

| Situation | Do |
|---|---|
| `.agent/BRIEF.md` unfilled — a new project | fill it from the user's prompt yourself **first**, even for a one-turn build; a sprint (**godkit**) only if it is bigger |
| Start of a session that will change code | **godkit** — skip it for a one-turn edit |
| No map, or the brief says STALE or MISSING | **godkit-map**, before trusting your own reading |
| Task bigger than one turn | **godkit-plan** → **godkit-execute** → **godkit-test** |
| Ending a session that edited files | **godkit-handoff** |
| A hard-to-reverse decision, before it goes on the board | **godkit-doubt** |
| UI from scratch, or a redesign | **godkit-frontend** |
| A full file or many files as the deliverable | **godkit-output-enforcement** |
| Parallel branches, worktrees, a merge touching `.agent/` | **godkit-git** |
| A GitHub issue or PR | **godkit-triage** |
| Something failed, looped, or got done twice | **godkit-review** |
| The same file fixed a third time | **godkit-refactor** |
| The brief lists a capture candidate | **godkit-evolve**, after the main task |
| Any coding task | **godkit-lazy** — always on, the ladders below |
| "How does godkit work?" | **godkit-help** |

## Fewest turns, least code

**Turns.** Brief and map → `godkit recall` → `rg -n` → read only the line ranges they point at. Read once, wide, in one parallel batch; never re-read a file you just read or edited. Edit, do not rewrite. Verify once, at the end.

**Code.** Stop at the first rung that holds: needed at all? → already in this repo? → stdlib? → native platform feature? → installed dependency? → one line? → only then the minimum that works. The ladder runs *after* you understand the problem: trace the real flow first, and fix a bug where every caller routes through, not only on the path the ticket names. No abstraction nobody asked for. Mark a deliberate shortcut with a `godkit:` comment naming its ceiling.

**Splitting.** Fits this turn → do it. Otherwise split on **file boundaries**, each seam with scope, exit condition and verification. Route each seam to the cheapest provider that can do it — a command before a model, a small model before a strong one. Never accept a delegated result without running its check.

## Token discipline

- Filter long output before it enters context (`| tail -30`, `-q`); from a test run keep the failures and the summary line.
- Delegate with `file:line` pointers and an exit condition, never pasted content; ask for a result of ten lines or fewer.
- Reply with the result first and at most three lines of explanation, in the user's language. Do not restate the task or recap a diff the user can see.
- Board, thread and log entries are one line per item; `## Verified` holds the command and the one to five lines that decide it.

## Never simplify away

Reading the board, claiming, verifying a delegated result, logging — the protocol. Input validation at trust boundaries, error handling that prevents data loss, security, accessibility, and anything explicitly requested. Non-trivial logic leaves one runnable check behind.
