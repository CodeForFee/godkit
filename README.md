# Subagent

Workflow skills for AI agents. Ponytail governs **what you build**; subagent governs **how the
work is organized** — decomposition, delegation, verification, and handoff between agents that
share one repo.

Plain `SKILL.md` files following the [Agent Skills standard](https://agentskills.io/specification),
so the same files work in Claude Code, Codex, Gemini CLI, Cursor, Copilot, Windsurf, and Kiro.

## The two rules

**Read `.agent/BOARD.md` before you edit. Write `.agent/log/<entry>.md` before you finish.**

Two things go wrong when several agents share a repo, and neither is a coding mistake: work gets
redone because nobody logged it, and two agents edit one file from different mental models. Both
diffs look right alone; together they are a third bug nobody wrote.

## Shared state

```
.agent/
├── BOARD.md      claims (who owns which files) · bugs B-NNN open/fixed · decisions · last 3 handoffs
└── log/          one file per session: <UTC>-<agent>[-<session8>].md — append-only, never edited by others
```

Lives in the worked-on repo and is committed to git. In the repo because it is the only memory two
different tools can both read — Cursor cannot open Claude's memory directory, and vice versa. One
file per session because two tools writing separate files never conflict, and git merges them
without a thought.

## Skills

| Skill | Trigger |
|---|---|
| `subagent` | any multi-step task; delegate, split, orchestrate |
| `subagent-handoff` | session start/end, "resume", "who did what", "was this bug already fixed" |
| `subagent-plan` | "split this up", "who should do what", "can we parallelize" |
| `subagent-execute` | carrying out a plan, verifying delegated work, deciding whether to retry |
| `subagent-review` | "review the process", agents colliding, duplicated effort |
| `subagent-postmortem` | "why did that fail", loops, lost context, agents undoing each other |
| `subagent-help` | quick reference card |

`subagent/references/PATTERNS.md` loads on demand — harness patterns for when you are designing an
orchestration mechanism, not for ordinary work.

## Install

**Skills** — copy or symlink the seven skill directories into the tool's skills folder:

| Tool | Path |
|---|---|
| Claude Code | `~/.claude/skills/` or `<project>/.claude/skills/` |
| Codex CLI | `~/.codex/skills/` |
| Gemini CLI | `~/.gemini/skills/` |
| Cursor / Copilot / Windsurf / Kiro | their skills folder, same format |

Windows, all projects:

```powershell
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.claude\skills\subagent" -Target "E:\ClaudeCode\harness\subagent\subagent"
```

…and the same for each `subagent-*` directory.

**Enforcement** — a skill is model-invoked, so it can be skipped. These stubs cannot be. Copy them
into each repo you work in:

| File | Read by |
|---|---|
| `AGENTS.md` | Codex, Cursor, Gemini, and most others |
| `.cursor/rules/subagent.mdc` | Cursor (`alwaysApply: true`) |
| `.github/copilot-instructions.md` | Copilot |

**Claude Code hooks** — the strongest of the lot:

```bash
node hooks/install.js              # ~/.claude/settings.json, all projects
node hooks/install.js .claude/settings.json   # or just this project
node hooks/install.js --uninstall
```

The script path is derived from where `install.js` itself lives, so there is nothing to hand-edit
and moving the harness is a re-run, not a text hunt. It appends to whatever hooks you already have
(ponytail's survive), drops its own previous registration first so re-running is idempotent, and
writes a `.bak` beside the settings file.

- `SessionStart` injects `.agent/BOARD.md` and the newest two log entries into context, so the
  session starts with the handoff whether or not the model thinks to look.
- `Stop` **blocks the turn** if the working tree is dirty and this session wrote no log entry.
  Guarded on `stop_hook_active`, so it fires once and cannot loop.

Check both without a live session:

```bash
echo '{"session_id":"82df4726-e3f6","cwd":"/path/to/repo","hook_event_name":"SessionStart"}' \
  | node hooks/agent-brief.js --session-start        # prints the board

echo '{"session_id":"82df4726-e3f6","cwd":"/path/to/repo","stop_hook_active":false}' \
  | node hooks/agent-brief.js --stop                 # prints the blocking JSON, or nothing
```

## Related

- **ponytail** — the coding philosophy these compose with: YAGNI, stdlib first, shortest working
  diff.
