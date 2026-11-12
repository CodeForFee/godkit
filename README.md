<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/CodeForFee/godkit/main/assets/logo-dark.svg">
  <img src="https://raw.githubusercontent.com/CodeForFee/godkit/main/assets/logo.svg" alt="Godkit" width="104" height="104">
</picture>

# Godkit

### One memory for every coding agent

Shared project memory, task ownership and handoffs for Claude Code, Codex, Cursor and Antigravity.

[![npm](https://img.shields.io/npm/v/@codeforfee/godkit?color=cb3837&label=npm)](https://www.npmjs.com/package/@codeforfee/godkit)
[![CI](https://github.com/CodeForFee/godkit/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/CodeForFee/godkit/actions/workflows/test.yml)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-3c873a.svg)](package.json)
[![Zero runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-3c873a.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Quick start](#quick-start) · [How it works](#how-it-works) · [Agent support](#agent-support) · [Safety](#safety) · [Commands](#commands) · [Development](#development)

</div>

## Quick start

With Node.js 18 or later, run from your project:

```bash
cd your-project
npx @codeforfee/godkit init
npx @codeforfee/godkit doctor
```

`init` creates the shared project memory, installs rules, skills and role definitions, and sets up
hooks and MCP for detected hosts. Re-running it preserves project memory and user-owned settings.
Use `init --no-install` to configure only the project.

Then open your coding agent and work as usual. Godkit's rules guide it to read the shared state,
claim files before editing and leave a verified handoff. Hooks enforce the supported parts of
that workflow; coverage varies by host.

For a machine without Node.js, use the [runtime-aware installer](docs/installation.md). It reuses a
compatible runtime or prepares a private, checksum-verified Node 24 installation.

> **Codex:** approve Godkit's hooks through `/hooks` in the CLI or **Review hooks** in the app
> after installation and upgrades. Run `godkit doctor` to inspect configuration and execution evidence.

For a global CLI, install with `npm install -g @codeforfee/godkit`; the examples below use `godkit`.
You can also use `npx @codeforfee/godkit` in its place.

See the [installation guide](docs/installation.md) for upgrades, rollback, offline setup and uninstall.

## How it works

Coding agents share a filesystem, but their private session memories do not follow them between
hosts. Godkit keeps the project context in a committed `.agent/` directory so the next session can
continue from recorded work.

```text
.agent/
├── BOARD.md             file claims, task index, bugs and decisions
├── THREAD.md            coordination between sessions
├── BRIEF.md             project goals and constraints
├── MAP.md               generated codebase overview
├── graph.json           machine-readable project map
├── SKILLS.md            generated project skill summary
├── skills/<name>/       reusable project procedures
├── sprints/             goals split into waves of tasks
├── tasks/               plans, execution, verification and handoffs
└── log/                 one handoff log per session
```

The protocol has two rules:

> **Read `.agent/` before you edit. Write your log before you finish.**

An agent reads the board and map, claims a file scope, does the work and records the command that
verified it. Larger tasks are split by file boundaries; a sprint groups them into waves with a
verification step between waves. Claims and logs name the model that performed the work.

Commit `.agent/` with the changes it describes. Session logs are separate files to reduce merge
conflicts. Generated map files are regenerated rather than merged by hand.

### Skills and project maps

Godkit ships skills for planning, execution, testing, review, mapping and handoffs. The rules tell
the agent when to load each one; [the skill catalog](skills/) contains the full instructions.

- **Mapping:** `godkit scan` collects files and dependencies; the `godkit-map` skill analyzes them,
  then `godkit save` writes the graph and overview. These commands do not analyze the code by themselves.
- **Project procedures:** keep reusable skills in `.agent/skills/<name>/SKILL.md`. `godkit skills`
  inspects them; `godkit skills --link` makes eligible skills available to supported hosts. Skills
  declare `origin` and `enabled`; safety findings and recorded usage affect eligibility.
- **Improvement:** `godkit evolve` summarizes evidence about project skills; `godkit refactor`
  ranks source files by recorded churn and blame. The agent judges what needs changing.

## Agent support

| Integration | Claude Code | Codex | Cursor | Antigravity |
|:--|:--|:--|:--|:--|
| Rules | `CLAUDE.md` | `AGENTS.md` | `.cursor/rules/godkit.mdc` | `AGENTS.md`, `.agents/rules/godkit.md` |
| Workspace skills | `.claude/skills/` | `.agents/skills/` | through rules and skill paths | `.agents/skills/` |
| Native role files | `.claude/agents/` | `.codex/agents/` | no verified format | `.agents/agents/` |
| Hooks | full registration | full registration; approval required | adapted; shell-only changes untracked | adapted |
| MCP | supported | supported | supported | supported |

`godkit doctor --json` distinguishes configured files from features observed running in a host.
A generated role or registered hook alone does not establish that an IDE used it. Required host
trust and approval steps remain part of setup. `godkit doctor --fix` repairs Godkit-owned components.

See [agent portability](docs/agent-portability.md) for configuration paths, hook coverage and
surface-specific limitations.

### Native subagents and external runs

Use the host's native agents within the current session when available. Godkit provides explorer,
planner, implementer and reviewer roles, a `godkit-lead` for branches with at least two meaningful
independent seams, plus file analyzer and architect roles for mapping. `godkit agents sync`
generates definitions; root chooses the team and allocates shared host slots, including itself,
leads and waiting agents. Delegation stops at `root → lead → worker`; workers never spawn.
Leads do substantive work and integrate scoped results; root runs one full final gate. See the
[team policy](skills/godkit/references/routing.md#native-session-teams) for claims, capacity and host fallbacks.

Native permissions and isolation follow the host. A role file alone does not create an independent
sandbox or worktree; provide a worktree explicitly when the task requires one.

For an explicitly requested separate process, Godkit also provides external runners:

```bash
godkit agent list
godkit agent run godkit-reviewer "review lib/graph.js"
godkit delegate codex "review lib/graph.js"
```

External runs use the target CLI's permissions. Named agents follow their role definition;
`godkit delegate` defaults to read-only, and `--write` allows a writing task. Configure an accessible model with `godkit agent model` or
`GODKIT_<HOST>_MODEL`. See [delegation details](docs/agent-portability.md#subagents-delegation-checkpoints).

## Safety

Safety features depend on the hooks and tools available in each host:

- **Guard:** rejects dangerous commands, writes to sensitive paths and edits inside another
  session's live claim. Session-tagged claims provide enforcement; claims older than 24 hours are stale.
- **Plan gate:** prevents the owner of an MCP-claimed task from editing its scope while the task
  remains in `plan`.
- **Clock-out:** checks whether the session changed files and requests its handoff log. It checks
  the current session rather than treating every dirty file as that session's work.
- **Pre-commit:** warns about staged files outside live claims; `GODKIT_STRICT=1` makes it block.
  Installation preserves an existing foreign pre-commit hook.
- **Checkpoints:** save working-tree snapshots under hidden Git refs before supported edits,
  leaving the current branch and index untouched.

```bash
godkit rewind                 # list checkpoints
godkit rewind <session>/<n>   # preview the restore
godkit rewind <session>/<n> --yes
```

Restoring requires `--yes` and takes a safety checkpoint first. Files created since the snapshot
are left alone; ignored files are excluded.

`godkit verify` checks the structure of tasks and logs: identity, completion evidence and resumable
handoffs. It does not judge whether the recorded evidence proves correctness. Run it in CI:

```yaml
- run: npx -y @codeforfee/godkit verify
```

## MCP server

`init` registers the MCP server for detected hosts. To manage it separately:

```bash
godkit mcp install
godkit mcp                 # run on stdio
```

The server exposes tools for briefs, claims, release, logs, history search, map queries,
verification and external agent runs. The board, map and thread are also resources; skills are prompts.

Codex tool approvals follow its existing policy. The optional `godkit mcp install --codex-approve`
changes approval settings for Godkit's server; it is off by default. Restart or reconnect the MCP
server after upgrades.

## Commands

| Command | Purpose |
|:--|:--|
| `godkit init [path] [--new] [--no-install]` | Set up a project; detect new projects automatically |
| `godkit doctor [--json] [--fix]` | Inspect readiness and repair owned setup |
| `godkit recall <file\|words>` | Search logs, tasks, board, thread and archive |
| `godkit verify [--quiet]` | Check task and log contracts |
| `godkit sprint [new "<goal>"\|close]` | Track a goal and its task waves |
| `godkit scan` / `godkit save` | Collect files and save an analyzed project map |
| `godkit skills [--link\|--unlink]` | Inspect and project eligible project skills |
| `godkit evolve [--write]` | Summarize skill evidence |
| `godkit refactor [--all]` | Rank source files for review |
| `godkit hooks [status\|install\|uninstall]` | Manage host hooks |
| `godkit agents [sync\|clean\|status]` | Manage generated native role files |
| `godkit mcp [install\|uninstall]` | Manage MCP registration; no argument runs the server |
| `godkit rewind [session/n] [--yes]` | Preview or restore a checkpoint |
| `godkit uninstall [tool\|--project]` | Remove owned setup or project skill copies; preserve `.agent/` |

Run `godkit --help` for additional commands, including external runners, evaluations and optional
auto-initialization.

<details>
<summary>Common environment settings</summary>

| Variable | Effect |
|:--|:--|
| `GODKIT_LAZY_MODE` | `lite`, `full`, `ultra` or `off`; default `full` |
| `GODKIT_STRICT=1` | Enforce pre-commit claim coverage |
| `GODKIT_GUARD=off` | Disable the guard |
| `GODKIT_CHECKPOINT=off` | Disable checkpoints |
| `GODKIT_<HOST>_MODEL` | Select a model for external runs |
| `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `CURSOR_HOME`, `GEMINI_HOME` | Override host configuration locations |

</details>

## Troubleshooting

| Symptom | Next step |
|:--|:--|
| No session brief or edit tracking | Run `godkit doctor` and `godkit hooks status`; approve Codex hooks if pending |
| Setup exists but a capability is unverified | Exercise it in a real host session; configuration alone is insufficient |
| A native role is missing | Run `godkit agents status`; sync definitions and start a new host session |
| An external run rejects the model | Choose an accessible model with `godkit agent model` or `GODKIT_<HOST>_MODEL` |
| A host fails after an upgrade | Reconnect MCP and review hooks; consult [installation and recovery](docs/installation.md) |

## Development

Node.js 18+; zero runtime dependencies. TypeScript is used only for development checks.

```bash
npm ci
npm run check          # generated rules, hooks, templates and version consistency
npm run typecheck      # boundary contracts and annotated JavaScript
npm test               # checks, then node --test
npm run benchmark      # JSON performance measurements
```

CI covers Windows, macOS and Linux with Node 18, 22, 24 and 26. Release checks exercise the packed
npm artifact, project initialization, MCP exchange and installer fixtures. Host-session verification
remains separate from those checks.

Contributions follow [AGENTS.md](AGENTS.md): read the board, claim files, verify the change and leave
a log. The landing page lives in [site/](site/README.md); release history is in [CHANGELOG.md](CHANGELOG.md).

MIT © [CodeForFee](https://github.com/CodeForFee) · [License](LICENSE)
