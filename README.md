park
beta
Cuộc trò chuyện mới
Tìm kiếm trong các cuộc trò chuyện
Video
Thư viện
Sổ ghi chú mới
Untitled notebook
Professional Godkit README Formatting
Cấu hình VPS tối ưu
Giới thiệu công cụ Godkit
Cách Đổi Tài Khoản GitHub CLI
Ứng Tuyển Freshdi: Tech Team
Nguồn cấp ổn định cho AMS1117
Chó Chihuahua Xoá Nền
Giải thích nối dây ESP32 S3
So sánh giá DrayTek Vigor2927
Tác dụng Timer Interrupt ESP32
So sánh Dell Latitude E7270 và E5470
Subagent: AI Workflow Orchestration Design
Lỗi Docker Compose Không Tìm Thấy File
UART và RS485: Tốc độ và Khoảng cách
Sửa lỗi thông báo, xung đột DB
Giải pháp cho Revenge Bedtime Procrastination
Đổi tài khoản GitHub trên VS Code
Hướng dẫn tạo slide quy trình IoT
Hồ sơ nhận việc cần công chứng
Đánh giá phụ kiện Essager: Tốt, Rẻ
Test Gemini API Key Free Tier
Docker build tốn dung lượng đĩa
Máy Lạnh Casper Tiêu Thụ Bao Nhiêu Điện
Project Tasks & Pricing Discussion
Ticket System Bug & Feature Updates
Yêu Cầu Ảnh Thẻ Lịch Sự
Cấu trúc thư mục Expo Router chuẩn
Lỗi kết nối ESP32-S3: Hướng dẫn khắc phục
Esptool Troubleshooting and Limitations
Dùng Relay với JK BMS an toàn
Tách pin 24V thành 12V và 24V
Ngắt khẩn cấp pin BMS JK
Trò chuyện với Gemini
make readme professional and beautifull# Godkit



[![CI](https://github.com/CodeForFee/godkit/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/CodeForFee/godkit/actions/workflows/test.yml)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)



**One shared harness for every AI agent.** Claude Code, Cursor, Codex and Antigravity all point at the same repo — so give them the same memory, the same board, and the same rules.



```bash

npx godkit init

```



---



## Contents



- [The problem](#the-problem)

- [What Godkit does](#what-godkit-does)

- [Install](#install)

  - [Hooks](#hooks-claude-code-codex)

  - [godkit-lazy modes](#godkit-lazy-modes)

- [The project map](#the-project-map)

- [Skills](#skills)

- [Project skills](#project-skills)

- [Design](#design)

- [Development](#development)

- [License](#license)



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

├── SKILLS.md             this project's own skills (generated)

├── skills/<name>/        procedures this project repeats, linked into host paths

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

godkit init              # scaffold .agent/ + rule files into the current repo

godkit skills            # this project's own skills; --link to expose them to hosts

godkit doctor            # what is set up, and whether the map is stale

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



| Hook | Event | Does |

|---|---|---|

| `brief.js` | `SessionStart` | injects the board, map freshness, and the newest log entries |

| `lazy-activate.js` | `SessionStart` | resolves the active `godkit-lazy` mode and injects its ruleset |

| `lazy-subagent.js` | `SubagentStart` | injects the same `godkit-lazy` ruleset into spawned subagents |

| `lazy-mode-tracker.js` | `UserPromptSubmit` | tracks `/godkit-lazy` mode switches for the rest of the session |

| `clockout.js` | `Stop` | blocks the turn if files changed and no log was written |

| `map-watch.js` | `PostToolUse` (Bash) | after a commit or merge, says if the map went stale |



### godkit-lazy modes



Where the hooks are installed, `godkit-lazy` runs every session automatically, at a level resolved in this order: the `GODKIT_LAZY_MODE` env var, then `defaultMode` in `~/.config/godkit/config.json` (`%APPDATA%\godkit\config.json` on Windows), then `full`.



```

/godkit-lazy [lite|full|ultra|off]           switch for this session (no argument reports the level)

/godkit-lazy default [lite|full|ultra|off]   persist the default for new sessions

```



Injects into every subagent spawned via the Agent tool too — scope that with `GODKIT_LAZY_SUBAGENT_MATCHER` (a regex tested against the subagent's type) if some agent types should skip it.



## The project map



`godkit-map` builds a graph of the codebase into `.agent/graph.json`, with a readable `.agent/MAP.md` projection. The deterministic half is a script — walk, categorize, resolve imports, group files that import each other into the same batch:



```bash

godkit scan     # walk, categorize, resolve imports, batch

godkit save     # normalize, write graph.json + MAP.md + meta.json

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

| `godkit-git` | worktrees, commit-as-checkpoint, merging `.agent/` |

| `godkit-doubt` | pressure-testing a decision before it binds everyone |

| `godkit-frontend` | design taste — dials, banned defaults, 11 style/workflow variants |

| `godkit-output-enforcement` | catching stubbed or truncated generated output |

| `godkit-evolve` | capturing, deriving and fixing this project's own skills |

| `godkit-help` | quick reference card |



## Project skills



The 13 skills above ship with godkit and are the same everywhere. A *project* also accumulates

its own procedures — a fixture reset, a release check, a migration dance. Those live in

`.agent/skills/<name>/SKILL.md`: committed, tool-neutral, and linked into the paths Claude Code

and Codex actually read.



```bash

godkit skills                      # list them: origin, safety findings, which hosts see them

godkit skills --link               # link into .claude/skills/ and .agents/skills/

godkit skills --unlink

godkit evolve                      # what the logs say about each one

godkit evolve --write              # project that to .agent/SKILLS.md

```



Write one with the `godkit-evolve` skill, or by hand. Two things keep a generated skill from

being dangerous, and the pattern scan is neither of them: it is **inert until linked** (no host

reads `.agent/skills/`), and `.agent/` is **committed**, so every skill and every revision lands

in a diff. On top of those, a scan blocks linking a skill that bundles an executable, carries a

credential, or tries to override the agent's instructions.



Generated skills (`origin: captured` or `derived`) will not link at all under the default

`audit_only` mode — they sit in the repo as reviewable, inert markdown until you set

`GODKIT_EVOLVE_MODE=autonomous` or pass `--force`. `--force` overrides the mode; it never

overrides a safety block.



### Evidence



`godkit evolve` re-reads `.agent/log/*.md` and says what the evidence implies about each skill.

There is no separate store: a log entry lists the skills it used in its `skills:` frontmatter, and

that plus `status:` and the `## Verified` and `## Bugs` sections is the whole signal. Edit a skill

and bump `revised:`, and its evidence window resets — you are judging the text that exists now,

not what its ancestor did.



| | |

|---|---|

| **trusted** | 3 successes across 3 *distinct* sessions, no failures |

| **provisional** | the default, and where a trusted skill lands after one attributable failure |

| **quarantined** | 2 failures, a blocking safety finding, or `enabled: false` — will not link, even with `--force` |



**What "trusted" actually means, precisely: *used repeatedly, and the sessions that used it

finished verified*.** godkit does not run your agent, so it cannot observe a skill being used —

the `skills:` field is a self-report by the same agent that just used it, and self-reports skew

positive. This is a usage/outcome correlation, not a quality measure, and a trusted skill can

still be wrong. `godkit evolve` prints how many log entries it could not attribute at all, on

every run, for exactly this reason.



Demotion is deliberately asymmetric — three sessions to promote, one failure to demote — because

a wrong instruction auto-loaded into an agent's context costs more than a slow promotion. And a

session that ends `blocked` with three skills listed blames none of them: attribution that guesses

would demote good skills.



## Design



- **Zero runtime dependencies.** Node standard library only, in the package and in the tests.

- **One source of truth per fact.** `AGENTS.md` generates every rule file. `graph.json` generates `MAP.md` and its own freshness signatures.

- **Hooks never throw.** Malformed input, missing git, absent `.agent/` — all exit 0. A broken hook must not break the session it was meant to help.

- **Nothing absolute is ever committed.** Paths in the graph are sanitized to the project root, so no machine layout or username ships in your repo.

- **Deliberate shortcuts are marked** with a `godkit:` comment naming the ceiling and the upgrade path. An unmarked shortcut is indistinguishable from a mistake.



## Development



```bash

npm test                          # node --test, no framework

node scripts/sync-rules.js        # regenerate the rule copies

node scripts/sync-rules.js --check

```



## License



MIT © [CodeForFee](https://github.com/CodeForFee)

Markdown
<div align="center">

# Godkit

**One shared harness for every AI coding agent.**

[![CI](https://img.shields.io/github/actions/workflow/status/CodeForFee/godkit/test.yml?branch=main&style=flat-square&label=CI)](https://github.com/CodeForFee/godkit/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square)](package.json)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg?style=flat-square)](package.json)

Claude Code, Cursor, Codex, and Antigravity all point at the same repo — Godkit gives them the same memory, board, and rules.

```bash
npx godkit init
Table of Contents
The Problem

How It Works

Installation & Setup

Tool Support

Lifecycle Hooks

Lazy Modes

Codebase Mapping

Core Skills

Project-Specific Skills

Trust & Evolution Lifecycle

Design Principles

Development

License

The Problem
Every agent arrives blind. It lacks context on previous architectural decisions, current work-in-progress, and file ownership. As a result, agents overwrite each other's work, collide on claims, and waste context windows rebuilding understanding from scratch.

Local tool memory cannot resolve this: Cursor cannot read Claude's memory cache, and Claude cannot access Cursor's state. The only reliable shared medium between disparate AI tools is the repository filesystem.

How It Works
Godkit commits a deterministic .agent/ directory directly into your repository:

Plaintext
.agent/
├── BOARD.md              # Live dashboard: roster, active claims, task backlog, bugs, decisions
├── THREAD.md             # Append-only communication log between agents
├── MAP.md                # Human-readable codebase architecture projection
├── graph.json            # Machine-readable dependency and call graph
├── SKILLS.md             # Index of repository-specific procedures
├── skills/<name>/        # Modular project skills, symlinked to host agent paths
├── tasks/T-001-*.md      # Standardized task lifecycles (Plan -> Execute -> Review -> Test -> Handoff)
└── log/<UTC>-<agent>.md  # Append-only session traces (isolated per run to prevent merge conflicts)
The Core Protocol
1. Read .agent/ before editing.

2. Write your session log before finishing.

Agents inspect the board, claim a scope, track intermediate task files, and record a structured handoff. Concurrent edits are guarded by claim tracking, and Git cleanly merges non-conflicting session logs automatically.

Installation & Setup
Bash
# Install global CLI tools and base skills
npm install -g godkit
godkit install

# Initialize .agent/ scaffold and rules inside your project
godkit init

# Check environment status and map freshness
godkit doctor
Tool Support
Every agent rule file is generated from a single canonical AGENTS.md to guarantee alignment across toolchains:

Platform	Injected Skills Path	Persistent Rules File	Lifecycle Hook Support
Claude Code	~/.claude/skills/	CLAUDE.md	Yes
Codex	~/.agents/skills/	AGENTS.md	Yes
Cursor	—	.cursor/rules/godkit.mdc	Rules Only
Antigravity	~/.gemini/antigravity/skills/godkit	.agents/rules/godkit.md	Rules Only
Lifecycle Hooks
For supported platforms (Claude Code, Codex), install hooks to automate protocol enforcement:

Bash
node hooks/install.js          # Injects hooks into settings (~/.claude/settings.json)
node hooks/install.js --uninstall
Hook	Lifecycle Event	Functionality
brief.js	SessionStart	Injects the active board, freshness status, and latest logs
lazy-activate.js	SessionStart	Resolves the active godkit-lazy profile and context limits
lazy-subagent.js	SubagentStart	Inherits lazy execution policies into spawned subagents
lazy-mode-tracker.js	UserPromptSubmit	Tracks runtime changes to /godkit-lazy modes
clockout.js	Stop	Hard-blocks session exit if uncommitted changes lack a corresponding log
map-watch.js	PostToolUse (Bash)	Flags stale architecture maps immediately following commits or merges
godkit-lazy Modes
Optimize token consumption and execution depth dynamically. Mode resolution order:

GODKIT_LAZY_MODE environment variable

defaultMode in ~/.config/godkit/config.json (or %APPDATA%\godkit\config.json)

Fallback: full

Bash
/godkit-lazy [lite|full|ultra|off]          # Switch mode for the active session
/godkit-lazy default [lite|full|ultra|off]  # Persist global default for new sessions
Tip: Filter subagent injection by supplying a type regex via GODKIT_LAZY_SUBAGENT_MATCHER.

Codebase Mapping
Godkit maps structural code dependencies into .agent/graph.json alongside a high-level overview in .agent/MAP.md.

Bash
godkit scan    # Traverse tree, resolve imports, and cluster linked modules
godkit save    # Normalize outputs, update graph.json, MAP.md, and meta.json
Query via Grep: Fast, zero-context lookup using structured node IDs (type:path[:name]):

Bash
# Locate relevant concepts
rg '"summary"' .agent/graph.json | rg -i token

# Find every caller of a specific function
rg 'function:src/auth/token.ts:isExpired' .agent/graph.json
Incremental Diffing: Graph refreshes check repository commit signatures, triggering only necessary updates (SKIP, PARTIAL, ARCHITECTURE, or FULL).

Fail-Safe Persistence: Corrupted parses will not overwrite existing valid graph states.

Core Skills
Godkit bundles 13 standardized skills across all hosts:

Skill	Purpose
godkit	Initial repo triage, task routing, and domain partitioning
godkit-map	Codebase relationship discovery and map maintenance
godkit-handoff	Session synchronization and .agent/ protocol adherence
godkit-plan	Architectural boundary decomposition and task authoring
godkit-execute	Isolated step execution and automated recovery
godkit-review	Diagnostic audits and execution verification
godkit-test	Assertion construction and automated test harnesses
godkit-lazy	Scope pruning and selective context loading
godkit-git	Worktree orchestration and non-destructive branch merging
godkit-doubt	Premise stress-testing and architectural challenge checks
godkit-frontend	Taste parameters, component rules, and design guidelines
godkit-output-enforcement	Detection and prevention of stubbed or truncated output
godkit-evolve	Autonomous skill extraction, adaptation, and auditing
godkit-help	Quick-reference cheat sheet for all commands and formats
Project-Specific Skills
Define custom team workflows (such as fixture resets or release scripts) inside .agent/skills/<name>/SKILL.md.

Bash
godkit skills          # List custom skills, origins, safety profiles, and host links
godkit skills --link   # Expose skills to host directories (.claude/skills, .agents/skills)
godkit skills --unlink # Revoke all active skill symlinks
godkit evolve          # Parse logs and compute skill performance metrics
godkit evolve --write  # Export metrics into .agent/SKILLS.md
Safety & Guardrails
Inert by Default: Host tools cannot read unlinked skills inside .agent/skills/.

Reviewable: All generated procedures must be committed to Git history.

Safety Blocks: Skills bundling binaries, credential leaks, or instruction injections are blocked from linking automatically.

Audited Modes: Generated skills require GODKIT_EVOLVE_MODE=autonomous or manual --force review before linking.

Trust & Evolution Lifecycle
godkit evolve monitors real-world outcomes using session frontmatter (skills:, status:, ## Verified, ## Bugs):

Plaintext
  [ Provisional ] ──(3 clean sessions)──> [ Trusted ]
         │                                    │
    (1 failure)                          (1 failure)
         │                                    │
         ▼                                    ▼
  [ Quarantined ] <───────────────────────────┘
Status	Criteria	Execution Rules
trusted	≥3 consecutive verified sessions without error	Auto-linkable
provisional	Default for new, edited, or single-failure skills	Requires verification review
quarantined	≥2 failures, security red flags, or enabled: false	Hard-blocked; cannot link
Design Principles
Zero Runtime Dependencies: Built strictly on the Node.js standard library.

Single Source of Truth: AGENTS.md generates all vendor configs; graph.json generates all structural documentation.

Fail-Safe Hooks: Hooks exit cleanly (0) on invalid inputs, missing repos, or missing paths to prevent workflow interruption.

Sanitized Paths: File paths are normalized relative to repository roots to prevent local system paths from being committed.

Explicit Workarounds: Temporary shortcuts require inline godkit: comments defining their upgrade boundaries.

Development
Bash
# Run the test suite (Node built-in test runner)
npm test

# Sync rules across all agent configurations
node scripts/sync-rules.js

# Verify synchronization in CI
node scripts/sync-rules.js --check
License
Distributed under the MIT License.

Copyright © CodeForFee.

gửi tôi full

Markdown
<div align="center">

# Godkit

**One shared harness for every AI coding agent.**

[![CI](https://img.shields.io/github/actions/workflow/status/CodeForFee/godkit/test.yml?branch=main&style=flat-square&label=CI)](https://github.com/CodeForFee/godkit/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square)](package.json)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg?style=flat-square)](package.json)

Claude Code, Cursor, Codex, and Antigravity all point at the same repo — Godkit gives them the same memory, board, and rules.

```bash
npx godkit init
Table of Contents
The Problem

How It Works

Installation & Setup

Tool Support

Lifecycle Hooks

Lazy Modes

Codebase Mapping

Core Skills

Project-Specific Skills

Trust & Evolution Lifecycle

Design Principles

Development

License

The Problem
Every agent arrives blind. It lacks context on previous architectural decisions, current work-in-progress, and file ownership. As a result, agents overwrite each other's work, collide on claims, and waste context windows rebuilding understanding from scratch.

Local tool memory cannot resolve this: Cursor cannot read Claude's memory cache, and Claude cannot access Cursor's state. The only reliable shared medium between disparate AI tools is the repository filesystem.

How It Works
Godkit commits a deterministic .agent/ directory directly into your repository:

Plaintext
.agent/
├── BOARD.md              # Live dashboard: roster, active claims, task backlog, bugs, decisions
├── THREAD.md             # Append-only communication log between agents
├── MAP.md                # Human-readable codebase architecture projection
├── graph.json            # Machine-readable dependency and call graph
├── SKILLS.md             # Index of repository-specific procedures
├── skills/<name>/        # Modular project skills, symlinked to host agent paths
├── tasks/T-001-*.md      # Standardized task lifecycles (Plan -> Execute -> Review -> Test -> Handoff)
└── log/<UTC>-<agent>.md  # Append-only session traces (isolated per run to prevent merge conflicts)
The Core Protocol
1. Read .agent/ before editing.

2. Write your session log before finishing.

Agents inspect the board, claim a scope, track intermediate task files, and record a structured handoff. Concurrent edits are guarded by claim tracking, and Git cleanly merges non-conflicting session logs automatically.

Installation & Setup
Bash
# Install global CLI tools and base skills
npm install -g godkit
godkit install

# Initialize .agent/ scaffold and rules inside your project
godkit init

# Check environment status and map freshness
godkit doctor
Tool Support
Every agent rule file is generated from a single canonical AGENTS.md to guarantee alignment across toolchains:

Platform	Injected Skills Path	Persistent Rules File	Lifecycle Hook Support
Claude Code	~/.claude/skills/	CLAUDE.md	Yes
Codex	~/.agents/skills/	AGENTS.md	Yes
Cursor	—	.cursor/rules/godkit.mdc	Rules Only
Antigravity	~/.gemini/antigravity/skills/godkit	.agents/rules/godkit.md	Rules Only
godkit install places the skills once per machine; godkit init writes the rule files once per project. Every rule file is generated from a single AGENTS.md, so they cannot drift apart — CI byte-compares them.

Where a tool has no hook support, the always-on rule file is the enforcement.

Lifecycle Hooks
For supported platforms (Claude Code, Codex), install hooks to automate protocol enforcement:

Bash
node hooks/install.js          # Injects hooks into settings (~/.claude/settings.json)
node hooks/install.js --uninstall
Re-running is safe: it drops its own previous entries first, leaves other tools' hooks alone, and writes a .bak. If it cannot parse your settings file it changes nothing and says so.

Hook	Lifecycle Event	Functionality
brief.js	SessionStart	Injects the active board, freshness status, and latest logs
lazy-activate.js	SessionStart	Resolves the active godkit-lazy profile and context limits
lazy-subagent.js	SubagentStart	Inherits lazy execution policies into spawned subagents
lazy-mode-tracker.js	UserPromptSubmit	Tracks runtime changes to /godkit-lazy modes
clockout.js	Stop	Hard-blocks session exit if uncommitted changes lack a corresponding log
map-watch.js	PostToolUse (Bash)	Flags stale architecture maps immediately following commits or merges
godkit-lazy Modes
Where hooks are installed, godkit-lazy runs every session automatically. Mode resolution order:

GODKIT_LAZY_MODE environment variable

defaultMode in ~/.config/godkit/config.json (or %APPDATA%\godkit\config.json on Windows)

Fallback: full

Bash
/godkit-lazy [lite|full|ultra|off]          # Switch mode for the active session (no arg reports level)
/godkit-lazy default [lite|full|ultra|off]  # Persist global default for new sessions
Injects into every subagent spawned via the Agent tool too — scope that with GODKIT_LAZY_SUBAGENT_MATCHER (a regex tested against the subagent's type) if some agent types should skip it.

Codebase Mapping
godkit-map builds a graph of the codebase into .agent/graph.json, with a readable .agent/MAP.md projection. The deterministic half is a script — walk, categorize, resolve imports, group files that import each other into the same batch:

Bash
godkit scan    # Walk, categorize, resolve imports, batch
godkit save    # Normalize, write graph.json + MAP.md + meta.json
The judgment half is the model: what each thing is for, how the layers actually divide, and where the landmines are.

Query via Grep: Fast, zero-context lookup using structured node IDs (type:path[:name]):

Bash
# Locate relevant concepts
rg '"summary"' .agent/graph.json | rg -i token

# Find every caller of a specific function
rg 'function:src/auth/token.ts:isExpired' .agent/graph.json
Incremental Diffing: The map records the commit it was built at; the classifier decides how much to redo (SKIP, PARTIAL, ARCHITECTURE, or FULL) so a two-file change never triggers a full rebuild.

Structural Signatures: Derived directly from the graph itself rather than a second store.

Fail-Safe Persistence: Refuses to overwrite a graph it could not read, preventing corrupted parses from wiping memory.

Core Skills
Godkit bundles 13 standardized skills across all hosts:

Skill	Purpose
godkit	Initial repo triage, task routing, and domain partitioning
godkit-map	Codebase relationship discovery and map maintenance
godkit-handoff	Session synchronization and .agent/ protocol adherence
godkit-plan	Architectural boundary decomposition and task authoring
godkit-execute	Isolated step execution and automated recovery
godkit-review	Diagnostic audits and execution verification
godkit-test	Assertion construction and automated test harnesses
godkit-lazy	Scope pruning and selective context loading
godkit-git	Worktree orchestration and non-destructive branch merging
godkit-doubt	Premise stress-testing and architectural challenge checks
godkit-frontend	Taste parameters, banned defaults, and 11 style/workflow variants
godkit-output-enforcement	Detection and prevention of stubbed or truncated output
godkit-evolve	Autonomous skill extraction, adaptation, and auditing
godkit-help	Quick-reference cheat sheet for all commands and formats
Project-Specific Skills
A project also accumulates its own procedures — a fixture reset, a release check, a migration dance. Those live in .agent/skills/<name>/SKILL.md: committed, tool-neutral, and linked into the paths Claude Code and Codex actually read.

Bash
godkit skills          # List custom skills: origin, safety findings, which hosts see them
godkit skills --link   # Link into .claude/skills/ and .agents/skills/
godkit skills --unlink # Remove all active links
godkit evolve          # View what logs say about each skill
godkit evolve --write  # Project metrics into .agent/SKILLS.md
Write one with the godkit-evolve skill, or by hand.

Safety & Guardrails
Inert Until Linked: Host tools cannot read unlinked skills inside .agent/skills/.

Committed: Every skill and revision lands in a Git diff.

Safety Blocks: A scan blocks linking any skill that bundles an executable, carries a credential, or tries to override agent instructions.

Audited Modes: Generated skills (origin: captured or derived) will not link under the default audit_only mode unless GODKIT_EVOLVE_MODE=autonomous is set or --force is passed. --force overrides the mode; it never overrides a safety block.

Trust & Evolution Lifecycle
godkit evolve monitors real-world outcomes using session frontmatter (skills:, status:, ## Verified, ## Bugs):

Plaintext
  [ Provisional ] ──(3 clean sessions)──> [ Trusted ]
         │                                    │
    (1 failure)                          (1 failure)
         │                                    │
         ▼                                    ▼
  [ Quarantined ] <───────────────────────────┘
Status	Criteria	Execution Rules
trusted	3 successes across 3 distinct sessions, no failures	Auto-linkable
provisional	Default for new, edited, or single-failure skills	Verification required
quarantined	2 failures, a blocking safety finding, or enabled: false	Hard-blocked; will not link even with --force
Usage Correlation: "Trusted" means used repeatedly and finished verified. Because agents self-report skill usage, this reflects outcome correlation rather than an absolute code audit.

Asymmetric Demotion: 3 clean sessions are required to promote, but 1 failure triggers demotion. Sessions ending in blocked with multiple skills do not penalize any individual skill to prevent false demotions.

Design Principles
Zero Runtime Dependencies: Built strictly on the Node.js standard library in both runtime and tests.

Single Source of Truth: AGENTS.md generates all vendor configs; graph.json generates MAP.md and freshness signatures.

Fail-Safe Hooks: Hooks exit cleanly (0) on invalid inputs, missing repos, or missing paths to prevent workflow interruption.

Sanitized Paths: File paths are normalized relative to repository roots; no local system layouts or usernames are committed.

Explicit Workarounds: Deliberate shortcuts require inline godkit: comments defining their upgrade boundaries.

Development
Bash
# Run tests (Node built-in test runner)
npm test

# Sync rules across all agent configurations
node scripts/sync-rules.js

# Verify synchronization in CI
node scripts/sync-rules.js --check
License
Distributed under the MIT License.

Copyright © CodeForFee.

gửi 1 file.md full

Python
readme_content = """<div align="center">

# Godkit

**One shared harness for every AI coding agent.**

[![CI](https://img.shields.io/github/actions/workflow/status/CodeForFee/godkit/test.yml?branch=main&style=flat-square&label=CI)](https://github.com/CodeForFee/godkit/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square)](package.json)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg?style=flat-square)](package.json)

Claude Code, Cursor, Codex, and Antigravity all point at the same repo — Godkit gives them the same memory, board, and rules.

```bash
npx godkit init
Table of Contents
The Problem

How It Works

Installation & Setup

Tool Support

Lifecycle Hooks

Lazy Modes

Codebase Mapping

Core Skills

Project-Specific Skills

Trust & Evolution Lifecycle

Design Principles

Development

License

The Problem
Every agent arrives blind. It lacks context on previous architectural decisions, current work-in-progress, and file ownership. As a result, agents overwrite each other's work, collide on claims, and waste context windows rebuilding understanding from scratch.

Local tool memory cannot resolve this: Cursor cannot read Claude's memory cache, and Claude cannot access Cursor's state. The only reliable shared medium between disparate AI tools is the repository filesystem.

How It Works
Godkit commits a deterministic .agent/ directory directly into your repository:

Plaintext
.agent/
├── BOARD.md              # Live dashboard: roster, active claims, task backlog, bugs, decisions
├── THREAD.md             # Append-only communication log between agents
├── MAP.md                # Human-readable codebase architecture projection
├── graph.json            # Machine-readable dependency and call graph
├── SKILLS.md             # Index of repository-specific procedures
├── skills/<name>/        # Modular project skills, symlinked to host agent paths
├── tasks/T-001-*.md      # Standardized task lifecycles (Plan -> Execute -> Review -> Test -> Handoff)
└── log/<UTC>-<agent>.md  # Append-only session traces (isolated per run to prevent merge conflicts)
The Core Protocol
1. Read .agent/ before editing.

2. Write your session log before finishing.

Agents inspect the board, claim a scope, track intermediate task files, and record a structured handoff. Concurrent edits are guarded by claim tracking, and Git cleanly merges non-conflicting session logs automatically.

Installation & Setup
Bash
# Install global CLI tools and base skills
npm install -g godkit
godkit install

# Initialize .agent/ scaffold and rules inside your project
godkit init

# Check environment status and map freshness
godkit doctor
Tool Support
Every agent rule file is generated from a single canonical AGENTS.md to guarantee alignment across toolchains:

Platform	Injected Skills Path	Persistent Rules File	Lifecycle Hook Support
Claude Code	~/.claude/skills/	CLAUDE.md	Yes
Codex	~/.agents/skills/	AGENTS.md	Yes
Cursor	—	.cursor/rules/godkit.mdc	Rules Only
Antigravity	~/.gemini/antigravity/skills/godkit	.agents/rules/godkit.md	Rules Only
godkit install places the skills once per machine; godkit init writes the rule files once per project. Every rule file is generated from a single AGENTS.md, so they cannot drift apart — CI byte-compares them.

Where a tool has no hook support, the always-on rule file is the enforcement.

Lifecycle Hooks
For supported platforms (Claude Code, Codex), install hooks to automate protocol enforcement:

Bash
node hooks/install.js          # Injects hooks into settings (~/.claude/settings.json)
node hooks/install.js --uninstall
Re-running is safe: it drops its own previous entries first, leaves other tools' hooks alone, and writes a .bak. If it cannot parse your settings file it changes nothing and says so.

Hook	Lifecycle Event	Functionality
brief.js	SessionStart	Injects the active board, freshness status, and latest logs
lazy-activate.js	SessionStart	Resolves the active godkit-lazy profile and context limits
lazy-subagent.js	SubagentStart	Inherits lazy execution policies into spawned subagents
lazy-mode-tracker.js	UserPromptSubmit	Tracks runtime changes to /godkit-lazy modes
clockout.js	Stop	Hard-blocks session exit if uncommitted changes lack a corresponding log
map-watch.js	PostToolUse (Bash)	Flags stale architecture maps immediately following commits or merges
godkit-lazy Modes
Where hooks are installed, godkit-lazy runs every session automatically. Mode resolution order:

GODKIT_LAZY_MODE environment variable

defaultMode in ~/.config/godkit/config.json (or %APPDATA%\\godkit\\config.json on Windows)

Fallback: full

Bash
/godkit-lazy [lite|full|ultra|off]          # Switch mode for the active session (no arg reports level)
/godkit-lazy default [lite|full|ultra|off]  # Persist global default for new sessions
Injects into every subagent spawned via the Agent tool too — scope that with GODKIT_LAZY_SUBAGENT_MATCHER (a regex tested against the subagent's type) if some agent types should skip it.

Codebase Mapping
godkit-map builds a graph of the codebase into .agent/graph.json, with a readable .agent/MAP.md projection. The deterministic half is a script — walk, categorize, resolve imports, group files that import each other into the same batch:

Bash
godkit scan    # Walk, categorize, resolve imports, batch
godkit save    # Normalize, write graph.json + MAP.md + meta.json
The judgment half is the model: what each thing is for, how the layers actually divide, and where the landmines are.

Query via Grep: Fast, zero-context lookup using structured node IDs (type:path[:name]):

Bash
# Locate relevant concepts
rg '"summary"' .agent/graph.json | rg -i token

# Find every caller of a specific function
rg 'function:src/auth/token.ts:isExpired' .agent/graph.json
Incremental Diffing: The map records the commit it was built at; the classifier decides how much to redo (SKIP, PARTIAL, ARCHITECTURE, or FULL) so a two-file change never triggers a full rebuild.

Structural Signatures: Derived directly from the graph itself rather than a second store.

Fail-Safe Persistence: Refuses to overwrite a graph it could not read, preventing corrupted parses from wiping memory.

Core Skills
Godkit bundles 13 standardized skills across all hosts:

Skill	Purpose
godkit	Initial repo triage, task routing, and domain partitioning
godkit-map	Codebase relationship discovery and map maintenance
godkit-handoff	Session synchronization and .agent/ protocol adherence
godkit-plan	Architectural boundary decomposition and task authoring
godkit-execute	Isolated step execution and automated recovery
godkit-review	Diagnostic audits and execution verification
godkit-test	Assertion construction and automated test harnesses
godkit-lazy	Scope pruning and selective context loading
godkit-git	Worktree orchestration and non-destructive branch merging
godkit-doubt	Premise stress-testing and architectural challenge checks
godkit-frontend	Taste parameters, banned defaults, and 11 style/workflow variants
godkit-output-enforcement	Detection and prevention of stubbed or truncated output
godkit-evolve	Autonomous skill extraction, adaptation, and auditing
godkit-help	Quick-reference cheat sheet for all commands and formats
Project-Specific Skills
A project also accumulates its own procedures — a fixture reset, a release check, a migration dance. Those live in .agent/skills/<name>/SKILL.md: committed, tool-neutral, and linked into the paths Claude Code and Codex actually read.

Bash
godkit skills          # List custom skills: origin, safety findings, which hosts see them
godkit skills --link   # Link into .claude/skills/ and .agents/skills/
godkit skills --unlink # Remove all active links
godkit evolve          # View what logs say about each skill
godkit evolve --write  # Project metrics into .agent/SKILLS.md
Write one with the godkit-evolve skill, or by hand.

Safety & Guardrails
Inert Until Linked: Host tools cannot read unlinked skills inside .agent/skills/.

Committed: Every skill and revision lands in a Git diff.

Safety Blocks: A scan blocks linking any skill that bundles an executable, carries a credential, or tries to override agent instructions.

Audited Modes: Generated skills (origin: captured or derived) will not link under the default audit_only mode unless GODKIT_EVOLVE_MODE=autonomous is set or --force is passed. --force overrides the mode; it never overrides a safety block.

Trust & Evolution Lifecycle
godkit evolve monitors real-world outcomes using session frontmatter (skills:, status:, ## Verified, ## Bugs):

Plaintext
  [ Provisional ] ──(3 clean sessions)──> [ Trusted ]
         │                                    │
    (1 failure)                          (1 failure)
         │                                    │
         ▼                                    ▼
  [ Quarantined ] <───────────────────────────┘
Status	Criteria	Execution Rules
trusted	3 successes across 3 distinct sessions, no failures	Auto-linkable
provisional	Default for new, edited, or single-failure skills	Verification required
quarantined	2 failures, a blocking safety finding, or enabled: false	Hard-blocked; will not link even with --force
Usage Correlation: "Trusted" means used repeatedly and finished verified. Because agents self-report skill usage, this reflects outcome correlation rather than an absolute code audit.

Asymmetric Demotion: 3 clean sessions are required to promote, but 1 failure triggers demotion. Sessions ending in blocked with multiple skills do not penalize any individual skill to prevent false demotions.

Design Principles
Zero Runtime Dependencies: Built strictly on the Node.js standard library in both runtime and tests.

Single Source of Truth: AGENTS.md generates all vendor configs; graph.json generates MAP.md and freshness signatures.

Fail-Safe Hooks: Hooks exit cleanly (0) on invalid inputs, missing repos, or missing paths to prevent workflow interruption.

Sanitized Paths: File paths are normalized relative to repository roots; no local system layouts or usernames are committed.

Explicit Workarounds: Deliberate shortcuts require inline godkit: comments defining their upgrade boundaries.

Development
Bash
# Run tests (Node built-in test runner)
npm test

# Sync rules across all agent configurations
node scripts/sync-rules.js

# Verify synchronization in CI
node scripts/sync-rules.js --check
License
Distributed under the MIT License.

Copyright © CodeForFee.
"""

with open("README.md", "w", encoding="utf-8") as f:
f.write(readme_content)

print("File README.md created successfully.")


```text?code_stdout&code_event_index=1
File README.md created successfully.

Your Markdown file is ready

Biểu tượng MD
README
 MD 
Đang mở
File README.md hoàn chỉnh đã được định dạng và tối ưu trực quan, bao gồm:

Header căn giữa với badges đồng bộ (flat-square).

Mục lục (Table of Contents) điều hướng chi tiết.

Cấu trúc thư mục .agent/ trực quan.

Bảng tổng hợp các tool/host, lifecycle hooks và 13 core skills.

Biểu đồ luồng trạng thái (state transition) cho vòng đời kiểm định skill.

Đầy đủ toàn bộ nội dung tài liệu gốc không bị cắt xén.




Gemini là một AI và có thể mắc sai sót.

Đang phân tích
<div align="center">

# Godkit

**One shared harness for every AI coding agent.**

[![CI](https://img.shields.io/github/actions/workflow/status/CodeForFee/godkit/test.yml?branch=main&style=flat-square&label=CI)](https://github.com/CodeForFee/godkit/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square)](package.json)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg?style=flat-square)](package.json)

Claude Code, Cursor, Codex, and Antigravity all point at the same repo — Godkit gives them the same memory, board, and rules.

```bash
npx godkit init
```

</div>

---

## Table of Contents

- [The Problem](#the-problem)
- [How It Works](#how-it-works)
- [Installation & Setup](#installation--setup)
  - [Tool Support](#tool-support)
  - [Lifecycle Hooks](#lifecycle-hooks)
  - [Lazy Modes](#godkit-lazy-modes)
- [Codebase Mapping](#codebase-mapping)
- [Core Skills](#core-skills)
- [Project-Specific Skills](#project-specific-skills)
  - [Trust & Evolution Lifecycle](#trust--evolution-lifecycle)
- [Design Principles](#design-principles)
- [Development](#development)
- [License](#license)

---

## The Problem

Every agent arrives blind. It lacks context on previous architectural decisions, current work-in-progress, and file ownership. As a result, agents overwrite each other's work, collide on claims, and waste context windows rebuilding understanding from scratch.

Local tool memory cannot resolve this: Cursor cannot read Claude's memory cache, and Claude cannot access Cursor's state. **The only reliable shared medium between disparate AI tools is the repository filesystem.**

---

## How It Works

Godkit commits a deterministic `.agent/` directory directly into your repository:

```text
.agent/
├── BOARD.md              # Live dashboard: roster, active claims, task backlog, bugs, decisions
├── THREAD.md             # Append-only communication log between agents
├── MAP.md                # Human-readable codebase architecture projection
├── graph.json            # Machine-readable dependency and call graph
├── SKILLS.md             # Index of repository-specific procedures
├── skills/<name>/        # Modular project skills, symlinked to host agent paths
├── tasks/T-001-*.md      # Standardized task lifecycles (Plan -> Execute -> Review -> Test -> Handoff)
└── log/<UTC>-<agent>.md  # Append-only session traces (isolated per run to prevent merge conflicts)
```

### The Core Protocol

> **1. Read `.agent/` before editing.**  
> **2. Write your session log before finishing.**

Agents inspect the board, claim a scope, track intermediate task files, and record a structured handoff. Concurrent edits are guarded by claim tracking, and Git cleanly merges non-conflicting session logs automatically.

---

## Installation & Setup

```bash
# Install global CLI tools and base skills
npm install -g godkit
godkit install

# Initialize .agent/ scaffold and rules inside your project
godkit init

# Check environment status and map freshness
godkit doctor
```

### Tool Support

Every agent rule file is generated from a single canonical `AGENTS.md` to guarantee alignment across toolchains:

| Platform | Injected Skills Path | Persistent Rules File | Lifecycle Hook Support |
| :--- | :--- | :--- | :---: |
| **Claude Code** | `~/.claude/skills/` | `CLAUDE.md` | **Yes** |
| **Codex** | `~/.agents/skills/` | `AGENTS.md` | **Yes** |
| **Cursor** | — | `.cursor/rules/godkit.mdc` | *Rules Only* |
| **Antigravity** | `~/.gemini/antigravity/skills/godkit` | `.agents/rules/godkit.md` | *Rules Only* |

`godkit install` places the skills once per machine; `godkit init` writes the rule files once per project. Every rule file is generated from a single `AGENTS.md`, so they cannot drift apart — CI byte-compares them.

Where a tool has no hook support, the always-on rule file *is* the enforcement.

---

### Lifecycle Hooks

For supported platforms (Claude Code, Codex), install hooks to automate protocol enforcement:

```bash
node hooks/install.js          # Injects hooks into settings (~/.claude/settings.json)
node hooks/install.js --uninstall
```

Re-running is safe: it drops its own previous entries first, leaves other tools' hooks alone, and writes a `.bak`. If it cannot parse your settings file it changes nothing and says so.

| Hook | Lifecycle Event | Functionality |
| :--- | :--- | :--- |
| `brief.js` | `SessionStart` | Injects the active board, freshness status, and latest logs |
| `lazy-activate.js` | `SessionStart` | Resolves the active `godkit-lazy` profile and context limits |
| `lazy-subagent.js` | `SubagentStart` | Inherits lazy execution policies into spawned subagents |
| `lazy-mode-tracker.js` | `UserPromptSubmit` | Tracks runtime changes to `/godkit-lazy` modes |
| `clockout.js` | `Stop` | Hard-blocks session exit if uncommitted changes lack a corresponding log |
| `map-watch.js` | `PostToolUse` (Bash) | Flags stale architecture maps immediately following commits or merges |

---

### godkit-lazy Modes

Where hooks are installed, `godkit-lazy` runs every session automatically. Mode resolution order:
1. `GODKIT_LAZY_MODE` environment variable
2. `defaultMode` in `~/.config/godkit/config.json` (or `%APPDATA%\godkit\config.json` on Windows)
3. Fallback: `full`

```bash
/godkit-lazy [lite|full|ultra|off]          # Switch mode for the active session (no arg reports level)
/godkit-lazy default [lite|full|ultra|off]  # Persist global default for new sessions
```

Injects into every subagent spawned via the Agent tool too — scope that with `GODKIT_LAZY_SUBAGENT_MATCHER` (a regex tested against the subagent's type) if some agent types should skip it.

---

## Codebase Mapping

`godkit-map` builds a graph of the codebase into `.agent/graph.json`, with a readable `.agent/MAP.md` projection. The deterministic half is a script — walk, categorize, resolve imports, group files that import each other into the same batch:

```bash
godkit scan    # Walk, categorize, resolve imports, batch
godkit save    # Normalize, write graph.json + MAP.md + meta.json
```

The judgment half is the model: what each thing is *for*, how the layers actually divide, and where the landmines are.

- **Query via Grep:** Fast, zero-context lookup using structured node IDs (`type:path[:name]`):
  ```bash
  # Locate relevant concepts
  rg '"summary"' .agent/graph.json | rg -i token

  # Find every caller of a specific function
  rg 'function:src/auth/token.ts:isExpired' .agent/graph.json
  ```
- **Incremental Diffing:** The map records the commit it was built at; the classifier decides how much to redo (`SKIP`, `PARTIAL`, `ARCHITECTURE`, or `FULL`) so a two-file change never triggers a full rebuild.
- **Structural Signatures:** Derived directly from the graph itself rather than a second store.
- **Fail-Safe Persistence:** Refuses to overwrite a graph it could not read, preventing corrupted parses from wiping memory.

---

## Core Skills

Godkit bundles 13 standardized skills across all hosts:

| Skill | Purpose |
| :--- | :--- |
| `godkit` | Initial repo triage, task routing, and domain partitioning |
| `godkit-map` | Codebase relationship discovery and map maintenance |
| `godkit-handoff` | Session synchronization and `.agent/` protocol adherence |
| `godkit-plan` | Architectural boundary decomposition and task authoring |
| `godkit-execute` | Isolated step execution and automated recovery |
| `godkit-review` | Diagnostic audits and execution verification |
| `godkit-test` | Assertion construction and automated test harnesses |
| `godkit-lazy` | Scope pruning and selective context loading |
| `godkit-git` | Worktree orchestration and non-destructive branch merging |
| `godkit-doubt` | Premise stress-testing and architectural challenge checks |
| `godkit-frontend` | Taste parameters, banned defaults, and 11 style/workflow variants |
| `godkit-output-enforcement`| Detection and prevention of stubbed or truncated output |
| `godkit-evolve` | Autonomous skill extraction, adaptation, and auditing |
| `godkit-help` | Quick-reference cheat sheet for all commands and formats |

---

## Project-Specific Skills

A project also accumulates its own procedures — a fixture reset, a release check, a migration dance. Those live in `.agent/skills/<name>/SKILL.md`: committed, tool-neutral, and linked into the paths Claude Code and Codex actually read.

```bash
godkit skills          # List custom skills: origin, safety findings, which hosts see them
godkit skills --link   # Link into .claude/skills/ and .agents/skills/
godkit skills --unlink # Remove all active links
godkit evolve          # View what logs say about each skill
godkit evolve --write  # Project metrics into .agent/SKILLS.md
```

Write one with the `godkit-evolve` skill, or by hand.

### Safety & Guardrails
- **Inert Until Linked:** Host tools cannot read unlinked skills inside `.agent/skills/`.
- **Committed:** Every skill and revision lands in a Git diff.
- **Safety Blocks:** A scan blocks linking any skill that bundles an executable, carries a credential, or tries to override agent instructions.
- **Audited Modes:** Generated skills (`origin: captured` or `derived`) will not link under the default `audit_only` mode unless `GODKIT_EVOLVE_MODE=autonomous` is set or `--force` is passed. `--force` overrides the mode; it never overrides a safety block.

---

### Trust & Evolution Lifecycle

`godkit evolve` monitors real-world outcomes using session frontmatter (`skills:`, `status:`, `## Verified`, `## Bugs`):

```text
  [ Provisional ] ──(3 clean sessions)──> [ Trusted ]
         │                                    │
    (1 failure)                          (1 failure)
         │                                    │
         ▼                                    ▼
  [ Quarantined ] <───────────────────────────┘
```

| Status | Criteria | Execution Rules |
| :--- | :--- | :--- |
| **`trusted`** | 3 successes across 3 distinct sessions, no failures | Auto-linkable |
| **`provisional`** | Default for new, edited, or single-failure skills | Verification required |
| **`quarantined`** | 2 failures, a blocking safety finding, or `enabled: false` | Hard-blocked; will not link even with `--force` |

- **Usage Correlation:** "Trusted" means used repeatedly and finished verified. Because agents self-report skill usage, this reflects outcome correlation rather than an absolute code audit.
- **Asymmetric Demotion:** 3 clean sessions are required to promote, but 1 failure triggers demotion. Sessions ending in `blocked` with multiple skills do not penalize any individual skill to prevent false demotions.

---

## Design Principles

- **Zero Runtime Dependencies:** Built strictly on the Node.js standard library in both runtime and tests.
- **Single Source of Truth:** `AGENTS.md` generates all vendor configs; `graph.json` generates `MAP.md` and freshness signatures.
- **Fail-Safe Hooks:** Hooks exit cleanly (`0`) on invalid inputs, missing repos, or missing paths to prevent workflow interruption.
- **Sanitized Paths:** File paths are normalized relative to repository roots; no local system layouts or usernames are committed.
- **Explicit Workarounds:** Deliberate shortcuts require inline `godkit:` comments defining their upgrade boundaries.

---

## Development

```bash
# Run tests (Node built-in test runner)
npm test

# Sync rules across all agent configurations
node scripts/sync-rules.js

# Verify synchronization in CI
node scripts/sync-rules.js --check
```

---

## License

Distributed under the [MIT License](LICENSE).  
Copyright © [CodeForFee](https://github.com/CodeForFee).