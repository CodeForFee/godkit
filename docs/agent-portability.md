# Agent portability

Godkit targets four tools. They agree on almost nothing, so the package keeps **one canonical copy of each fact** and gives every host a thin adapter pointing at it.

## What each tool reads

| | Claude Code | Cursor | Codex | Antigravity |
|---|---|---|---|---|
| **Skills** | `~/.claude/skills/<name>/SKILL.md` | not supported | `~/.agents/skills/<name>/SKILL.md` | `~/.gemini/antigravity/skills/godkit/` |
| **Skill layout** | one link per skill | — | one link per skill | one link for the whole folder |
| **Project-local skills** | `<project>/.claude/skills/<name>/` | not supported | `<project>/.agents/skills/<name>/` — *unverified against a live Codex* | not supported |
| **Always-on rules** | `CLAUDE.md` | `.cursor/rules/godkit.mdc` | `AGENTS.md` | `.agents/rules/godkit.md` |
| **Rules frontmatter** | none | `alwaysApply: true` | none | none |
| **Hooks** | yes | yes, via `hooks/adapt.js` (subset) | yes, same JSON | yes, via `hooks/adapt.js` (subset) |
| **Plugin manifest** | `.claude-plugin/plugin.json` | — | `.codex-plugin/plugin.json` | `gemini-extension.json` |
| **Invocation** | `/godkit` | ask in prose | `$godkit` | `/godkit` |
| **Slash commands** | auto-discovered from `commands/` | — | auto-discovered from `commands/` | auto-discovered from `commands/` |

Anything not listed reads a plain root `AGENTS.md`, which `godkit init` writes — so an unlisted tool still gets the protocol, just without skills or hooks.

**The `commands/` directory only reaches a host through a plugin or extension install**, where the
host discovers it inside the package directory. `npm install -g @codeforfee/godkit` places the skills, not the
commands — the invocation row above describes the plugin install. Nothing places `.toml` command
files into a host's own commands directory, deliberately: that path is the user's, and one file
per skill dropped into it is a lot of someone else's clutter.

`gemini-extension.json` carries `skills` and `agents` pointers as a **best-effort** adapter: they
are how Antigravity's own extension layout names those directories, and are harmless where a host
ignores an unknown field. What is actually verified is the skills path in the table above, which
is what `godkit install antigravity` writes.

**Project-local skills** (`.agent/skills/`, see the `godkit-evolve` skill) follow the same
one-canonical-copy rule as the rules files: `.agent/skills/<name>/` is the source, and
`godkit skills --link` projects it into each host's project path. Cursor and Antigravity have no
project skill directory, so for them the generated `.agent/SKILLS.md` plus the always-on rule
file is the whole story — the same enforced-versus-instructed asymmetry as hooks.

Linking is **per skill, never a folder link**. A folder link would clobber a user's own skills at
that path, and would make a quarantined skill still visible to the host. Per-skill links make
"not linked" mean something mechanical.

## The rule copies are generated, never hand-edited

`AGENTS.md` is the only place the rules are written. Every other rule file is produced from it:

```bash
node scripts/sync-rules.js          # regenerate
node scripts/sync-rules.js --check  # fail if any drifted (runs in CI)
```

Generating rather than hand-maintaining means a copy **cannot** be edited in the wrong place — the check only ever fails because someone forgot to re-run the generator, never because two files genuinely disagree.

Cursor's `.mdc` gets a frontmatter header prepended; every other copy is the body byte-for-byte. The test suite asserts that too, so a stale copy fails the build rather than shipping.

## Hooks, and what to do without them

Claude Code and Codex read the same hook JSON. Codex differs in one way that matters: **its matchers are always treated as regular expressions**, while Claude Code accepts a literal or a regex. `hooks/godkit-hooks.json` uses matchers (`Bash`, `startup|resume|clear|compact`) that mean the same thing under both readings.

| Hook | Event | Does |
|---|---|---|
| `brief.js` | `SessionStart` | injects the board, map freshness, newest log entries, THREAD tail, and this project's own skills |
| `lazy-activate.js` | `SessionStart` | resolves the active `godkit-lazy` mode, injects its ruleset |
| `work-track.js` | `PreToolUse`, `PostToolUse`, `SessionEnd` | records whether this session changed project files |
| `clockout.js` | `Stop` | blocks the turn if this session changed files and wrote no log |
| `map-watch.js` | `PostToolUse` (Bash) | after a commit or merge, says if the map went stale |
| `lazy-subagent.js` | `SubagentStart` | injects the same ruleset into a spawned subagent |
| `lazy-mode-tracker.js` | `UserPromptSubmit` | tracks `/godkit-lazy` mode switches |

`hooks/godkit-hooks.json` is **generated** from the `HOOKS` list in `lib/install.js` by
`node scripts/sync-hooks.js`, and CI fails if it drifted. Two registration paths — a plugin
manifest and a settings file — reading one list is what stops a hook from existing under one host
and not the other.

`godkit-lazy`'s mode resolves from `GODKIT_LAZY_MODE`, then `~/.config/godkit/config.json`, then
`full` — see `lib/lazy.js`. Two hooks share `SessionStart`: Claude Code and Codex both run every
group registered for an event, so `brief.js` and `lazy-activate.js` are independent groups in
`hooks/godkit-hooks.json`, not one script doing both jobs.

**Cursor and Antigravity have hooks, in their own dialects.** Cursor reads `~/.cursor/hooks.json` (`{version, hooks: {event: [{command, timeout}]}}`, camelCase events, answers `additional_context` / `followup_message`). Antigravity reads `~/.gemini/config/hooks.json` (named entries per hook, PascalCase events, answers `injectSteps` / `decision`). `hooks/adapt.js <host> <event>` sits between: it turns the host's input into the Claude shape our scripts read, runs the `HOOKS` rows for that event, and turns the output back. The registered events are the ones that need no permission verdict:

| Host | Events | Not registered |
|---|---|---|
| Cursor | `sessionStart`, `postToolUse`, `beforeShellExecution` (guard only), `stop`, `sessionEnd` | `preToolUse`, `subagentStart` (cannot inject context), compaction (`preCompact` only observes) |
| Antigravity | `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop` | `PreInvocation`, `PostInvocation` |

**PreToolUse is where the two hosts differ.** Both require a permission verdict from it. Antigravity documents `allow` as "delegating to the next hook or default policy", so a neutral answer is safe and it gets the whole set: the guard (deny only, otherwise `allow`) and `work-track`'s before-snapshot, which is what lets a change made only by a shell command count as work. Cursor documents no neutral answer (empty output is ambiguous, and what `allow` does to its approval prompt is not stated), so godkit registers only `beforeShellExecution`, with Cursor's matcher set to a regex that every command the guard can deny matches (`SHELL_TRIGGER` in `lib/guard.js`, asserted by a test). Ordinary commands never reach the hook. A command that matches and passes is answered `ask`, which can only add a prompt. On Cursor, then, the before-snapshot is not taken and a shell-only change goes unseen; direct edits (Cursor `Write`/`Delete`) count.

The guard is the same `hooks/guard.js` for every host (Claude and Codex register it from `HOOKS`; Antigravity and Cursor through `hooks/adapt.js`). Identity-free rules (`lib/guard.js`) are denied everywhere. The claim rule needs to know who is editing: a claim tagged with a session (`claude-opus-5 (9fe96f63)`, made through the `godkit_claim` tool) blocks every other session; an untagged claim, written by hand, only earns a one-time note, because a false deny on an agent's own files costs more than the collision.

Neither host tells a hook why a session started, so `SessionStart` always matches as `startup`, and neither exposes compaction, so there is no re-injection after one. Antigravity's tool names beyond the two its docs use are unverified; unknown names pass through unmapped.

A tool with no hooks at all still has its always-on rule file, which is why every rule copy carries the full clock-in and clock-out checklists. On Claude Code and Codex the protocol is *enforced*; on the reduced hosts it is *enforced for the parts above* and *instructed* for the rest. The shared `.agent/` state is what makes the difference survivable — a session that forgets to log leaves a gap the next agent can see in the board.

## Surfaces: CLI, VS Code extension, desktop app

| Agent | CLI | VS Code extension | Desktop app | What makes it automatic | State checked on this machine |
|---|---|---|---|---|---|
| Claude Code | yes | `anthropic.claude-code` | Claude desktop (Code tab) | Hooks in `~/.claude/settings.json` and the user-scope MCP server are shared by all three (the extension's docs say so for settings and MCP). Windows apps need `node` on the system PATH | Desktop: the SessionStart brief arrived in this very session (`CLAUDE_CODE_ENTRYPOINT=claude-desktop`). `node` is in `C:\Program Files\nodejs`, on the system PATH. CLI and extension: same file, not run separately |
| Codex | yes | `openai.chatgpt` | Codex app | `~/.codex/hooks.json` and `[mcp_servers.godkit]` in `~/.codex/config.toml`. **A hook is skipped until you approve it, and again whenever it changes** (trust is per hook hash): `/hooks` in the CLI, "Review hooks" in the app. The docs do not say how the VS Code extension approves | A `codex exec` run left no godkit trace: the hooks are waiting for approval. Extension: unverified |
| Antigravity | `agy` | Antigravity IDE | Antigravity | `~/.gemini/config/hooks.json` (docs: App, CLI and IDE) and `mcp_config.json` | Our hooks failed on Windows because of quoting (fixed). Another tool's quoted hook commands in the same file still fail and block `agy`'s edits |
| Cursor | not installed here | the Cursor agent | Cursor | `~/.cursor/hooks.json`, `mcp.json`. User-level hooks do not run in Cursor's cloud agents | The Cursor app is not installed on this machine, so nothing is verified end to end |

Two checks replace guessing. `godkit doctor` prints a **last seen** line per agent and surface (the SessionStart hook leaves one line each time, so "never" means that agent has not run godkit yet, whatever the config says), and `godkit hooks status` shows what is registered. A project still needs its own setup once (`godkit init`: rules, skills, `.agent/`); `godkit autoinit on` does that at the first agent session in any git repository, and is off by default because it writes into the project.

## Subagents, delegation, checkpoints

| | Claude Code | Codex | Cursor | Antigravity |
|---|---|---|---|---|
| Subagent files generated (`godkit agents`) | `.claude/agents/<name>.md` | `.codex/agents/<name>.toml` | not generated: format unverified | not generated: format unverified |
| `godkit delegate` target | `claude -p` (read-only: `dontAsk` + Read/Grep/Glob) | `codex exec --sandbox read-only` | no headless CLI on the test machine | `agy --print --mode plan` |
| Checked against the real CLI | yes | flags accepted; the account rejected its model | n/a | yes |
| Checkpoint hook (`PreToolUse` on edits) | yes | yes | no: no `PreToolUse` on every tool (see above) | yes |

`gemini -p --approval-mode plan` is also wired for delegation, but the CLI on the test machine refused the login ("migrate to Antigravity"), so its flags are unchecked.

Windows quoting. Antigravity (its own log shows it) and, to be safe, Cursor pass a hook command to cmd.exe so that every double quote arrives as a literal one: `node "E:/x/adapt.js"` reached node as a file name that includes the quote marks, and failed with "Cannot find module". The commands godkit writes for these two hosts therefore have no quotes: the path goes in bare, or as its 8.3 short form when it has whitespace. Claude Code and Codex keep the quoted form, which they handle. Another tool's quoted hook command in the same file fails the same way (the log named Coucou's `coucou-hook.exe`), and on Antigravity a failing hook blocks the tool call it guards.

The sources are `agents/*.md` (one definition per agent) and `evals/*.json` (the tasks `godkit eval` runs). Generated subagent files carry a `godkit-generated` marker; a file without it is never replaced or removed.

## Install paths

```bash
godkit install                  # all tools
godkit install claude codex     # just these
godkit install --dry-run        # say what would happen, change nothing
godkit hooks install            # register hooks for claude and codex
```

`godkit install` prefers a symlink, falls back to a directory junction on Windows (which needs no elevation), and copies as a last resort. A copy works but stops tracking package updates — `godkit doctor` shows what is in place, including which hooks are registered.

It only ever replaces a destination it owns: a link pointing back into this package, or a copy
carrying its `.godkit-install.json` marker. Anything else at that path is yours, and both install
and uninstall leave it where it is and say they skipped it.

## Adding a tool

1. Add its skill directory and layout style to `TOOLS` in `bin/godkit.js`.
2. Add its rule path to `TARGETS` in `scripts/sync-rules.js`, with a header template if it needs frontmatter.
3. Add its manifest at whatever path it expects, and add that manifest to `FILES` in `scripts/check-versions.js` if it carries a version.
   If the manifest is read at runtime by the CLI, add its path to `files` in `package.json` too —
   the packed-tarball test in `tests/package.test.js` is what catches a forgotten one.
4. Add a row to the table above.

Keep the adapter thin. If a host supports skills or hooks, point it at the existing `skills/` and `hooks/` files rather than making it a copy. If it only supports project instructions, generate its rule file from `AGENTS.md` like every other one.
