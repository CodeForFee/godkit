# Install and verify Godkit

Godkit keeps the same skills, roles, memory and MCP tools in both distributions. The npm package has no runtime dependencies. A developer with Node can use npm; the runtime-aware installer also works when Node is missing.

## Existing Node installation

From the project directory:

```sh
npx @codeforfee/godkit init
npx @codeforfee/godkit doctor --json
```

`init` detects installed hosts, installs project rules, skills and roles, and registers Godkit's hooks and MCP server. Re-running it preserves user configuration and project memory. `--no-install` configures only the project.

## Runtime-aware installation

Download `install.ps1` or `install.sh` and `runtime-lock.json` from the same [versioned GitHub release](https://github.com/CodeForFee/godkit/releases). Run the downloaded script from the target project:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Project C:\path\to\project
```

```sh
sh ./install.sh --project /path/to/project
```

The installer reuses a compatible maintained Node installation, or downloads the locked Node 24 archive for the operating system and architecture. It verifies the pinned SHA-256 before using the archive and keeps the runtime in Godkit's private home. The launcher, registered hooks and MCP entries reference an absolute executable path, so opening an IDE does not depend on shell startup files or PATH changes. The runtime is shared across installed Godkit releases.

The first install needs network access to obtain the release package and, if needed, Node. Files for unsupported operating systems or architectures are rejected with an explanation. Installed AI applications and their model accounts remain prerequisites; the installer does not install or log into those applications.

Local/offline deployment can use an unpacked release directory or a downloaded npm archive, a local lock and an explicit runtime:

```powershell
.\install.ps1 -Source .\godkit-package -Project C:\work\project -HomeDirectory C:\tools\godkit -RuntimeLock .\runtime-lock.json -NodePath C:\tools\node\node.exe -ProjectOnly
```

```sh
sh ./install.sh --source ./godkit-package --project ./project --home ./private-godkit --runtime-lock ./runtime-lock.json --node /absolute/path/to/node --project-only
```

`-ProjectOnly` / `--project-only` leaves machine host configuration untouched. Keep the release directory intact; it contains the skills and hook assets used by the CLI.

## Readiness and host trust

Run `godkit doctor --json` for a machine-readable report, or `godkit doctor` for the human-readable overview. `godkit doctor --fix` retries repair of Godkit-owned components, then inspects the result. Foreign entries, malformed user configuration and required host approvals are surfaced instead of silently replaced or approved.

Readiness separates these facts:

- **Installed/configured:** a file or registration exists and points to the expected installation.
- **Verified:** a check has evidence of actual execution. The local MCP probe performs a bounded JSON-RPC handshake and tools listing; this alone does not prove that an IDE connected to it.
- **Needs action:** a component is missing, trust is pending, or the relevant host session has not supplied execution evidence.
- **Unsupported:** the host does not supply the capability, or its integration format has not been verified.
- **Error:** a concrete operation failed, with a reason and a next action.

Codex, Claude and Antigravity have generated native role definitions. Cursor retains its supported rules, hooks and MCP integration, without a verified native role format. The capability report keeps these differences visible. Native delegation and peer messaging must run in the host before they can be reported as verified. Unit-test fixtures and simulated hosts never establish a real-world compatibility claim.

For Antigravity, `init` writes `.agents/agents/<name>.md` and workspace skills under `.agents/skills/`; `godkit install antigravity` uses canonical global `~/.gemini/config/skills/<name>/`. Open `/agents` to inspect roles, then ask the parent to use the applicable native role. Its instructions point to the exact workspace `SKILL.md` files to read on demand; automatic frontmatter preloading is not assumed. If a role is absent, start a new conversation; CLI skill changes also support `/skills reload`. [Discovery locations](https://antigravity.google/docs/customization-discovery), [native roles](https://antigravity.google/docs/subagents), [skill refresh](https://antigravity.google/docs/skills).

After installation or an upgrade, complete the host's own trust step when requested. For Codex hooks this is `/hooks` in the CLI or **Review hooks** in the app. MCP approvals follow the host's existing policy. Godkit does not silently enable the opt-in `--codex-approve` setting.
Restart or reconnect the host's MCP server after an upgrade so an already running session loads the updated code and tool schemas; new role files may also require a new host session.

After exercising a feature in a real host session, its agent can record the observation with `godkit doctor --record-evidence observation.json --json`. The JSON contains `host`, `feature`, `surface`, `hostVersion`, `session`, and `source: "host-session"`; use the actual values from that run. Supported features are `skills`, `roles`, `hooks`, `mcp`, `native_agents`, and `peer_messaging`. This is attributed self-report, not an independent harness audit. Godkit computes an asset digest automatically: changed configuration, role/skill content or relevant project rules invalidate the observation. A unit test or a local MCP health probe must not be recorded as host-session evidence.

Antigravity roles generated by Godkit are subagent-only (`mainAgent: false`). Ask the parent to invoke `godkit-explorer`, `godkit-planner`, `godkit-implementer` or `godkit-reviewer` using its native `invoke_subagent` tool. On the inspected AGY 1.5.5 installation, `agy agents` listed only global primary-selectable agents; it omitted workspace and subagent-only fixture roles. That command is not proof of native invocation or a reason to enable primary-agent selection. Confirm execution and peer messages in an actual Antigravity session.

## Upgrade, rollback and uninstall

Run the installer for the desired release again. It stages a versioned package, validates the CLI and MCP server, then configures the host and activates the release. An interrupted staging operation or a failed validation does not replace the current release. Configuration failure keeps the previous active state and attempts to restore the captured owned configuration. Conflicting concurrent changes are reported rather than overwritten.

The installation keeps one previous active release for rollback. Use the installed bootstrap entrypoint with `--rollback` and the same `--home` and `--project` values used for installation; an explicit local Node executable can run it:

```sh
/absolute/path/to/node /path/to/godkit/bin/bootstrap.js --rollback --home /path/to/private-godkit --project /path/to/project
```

`godkit uninstall` removes owned global skills, hook/MCP registrations and launchers. Project `.agent/` memory and project rules remain; remove owned project skill copies separately with `godkit uninstall --project`. Downloaded runtime/release caches are retained, including an interpreter that may currently be running. A foreign file with the same destination name is not adopted merely because it resembles a Godkit file.

## Release evidence and performance

CI exercises Windows, macOS and Linux, the maintained Node 22/24/26 lines, and legacy Node 18 compatibility. The release gate checks the actual npm tarball: contents, a Unicode/space-containing project path, project initialization, a real MCP exchange, and the platform installer using an isolated local fixture. Clean-runtime download and checksum failure tests use controlled fixtures; this is distinct from testing a real installed IDE.

`npm run typecheck` checks the development boundary contracts and annotated runtime implementation. TypeScript is a development dependency and is absent from the published package's runtime dependencies.

`npm run benchmark` produces JSON measurements without writing into a real user home. `node scripts/benchmark.js --output benchmark.json --baseline prior.json` adds a comparison to a prior measurement; comparisons are marked comparable only for matching OS, architecture and Node version. CI stores each run's report and compares it with the last available successful main report. Release assets include the metrics. Timing changes are measurements rather than a promise about other machines; context tokens are explicitly estimated from UTF-8 byte size.
