# Agent portability

Godkit targets four tools. They agree on almost nothing, so the package keeps **one canonical copy of each fact** and gives every host a thin adapter pointing at it.

## What each tool reads

| | Claude Code | Cursor | Codex | Antigravity |
|---|---|---|---|---|
| **Skills** | `~/.claude/skills/<name>/SKILL.md` | not supported | `~/.agents/skills/<name>/SKILL.md` | `~/.gemini/antigravity/skills/godkit/` |
| **Skill layout** | one link per skill | — | one link per skill | one link for the whole folder |
| **Always-on rules** | `CLAUDE.md` | `.cursor/rules/godkit.mdc` | `AGENTS.md` | `.agents/rules/godkit.md` |
| **Rules frontmatter** | none | `alwaysApply: true` | none | none |
| **Hooks** | yes | no | yes, same JSON | no |
| **Plugin manifest** | `.claude-plugin/plugin.json` | — | `.codex-plugin/plugin.json` | `gemini-extension.json` |
| **Invocation** | `/godkit` | ask in prose | `$godkit` | `/godkit` |

Anything not listed reads a plain root `AGENTS.md`, which `godkit init` writes — so an unlisted tool still gets the protocol, just without skills or hooks.

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
| `brief.js` | `SessionStart` | injects the board, map freshness, newest log entries, THREAD tail |
| `lazy-activate.js` | `SessionStart` | resolves the active `godkit-lazy` mode, injects its ruleset |
| `clockout.js` | `Stop` | blocks the turn if files changed and no log was written |
| `map-watch.js` | `PostToolUse` (Bash) | after a commit or merge, says if the map went stale |
| `lazy-subagent.js` | `SubagentStart` | injects the same ruleset into a spawned subagent |
| `lazy-mode-tracker.js` | `UserPromptSubmit` | tracks `/godkit-lazy` mode switches |

`godkit-lazy`'s mode resolves from `GODKIT_LAZY_MODE`, then `~/.config/godkit/config.json`, then
`full` — see `lib/lazy.js`. Two hooks share `SessionStart`: Claude Code and Codex both run every
group registered for an event, so `brief.js` and `lazy-activate.js` are independent groups in
`hooks/godkit-hooks.json`, not one script doing both jobs.

**Cursor and Antigravity have no hook support at all.** Their enforcement is the always-on rule file — which is exactly why every rule copy carries the full clock-in and clock-out checklists rather than a pointer to them. A tool that cannot be made to do something must at least be told.

That asymmetry is worth stating plainly: on Claude Code the protocol is *enforced*; everywhere else it is *instructed*. The shared `.agent/` state is what makes the difference survivable — a Cursor session that forgets to log leaves a gap the next agent can see in the board.

## Install paths

```bash
godkit install                  # all tools
godkit install claude codex     # just these
node hooks/install.js           # register hooks in ~/.claude/settings.json
```

`godkit install` prefers a symlink, falls back to a directory junction on Windows (which needs no elevation), and copies as a last resort. A copy works but stops tracking package updates — `godkit doctor` shows what is in place.

## Adding a tool

1. Add its skill directory and layout style to `TOOLS` in `bin/godkit.js`.
2. Add its rule path to `TARGETS` in `scripts/sync-rules.js`, with a header template if it needs frontmatter.
3. Add its manifest at whatever path it expects, and add that manifest to `FILES` in `scripts/check-versions.js` if it carries a version.
4. Add a row to the table above.

Keep the adapter thin. If a host supports skills or hooks, point it at the existing `skills/` and `hooks/` files rather than making it a copy. If it only supports project instructions, generate its rule file from `AGENTS.md` like every other one.
