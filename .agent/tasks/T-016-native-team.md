---
id: T-016
title: Native same-session teams with scoped skills and concise coordination
owner: gpt-6
scope: lib/agents.js lib/mcp.js agents/* tests/agents-delegate-checkpoint.test.js AGENTS.md CLAUDE.md .cursor/rules/* .agents/rules/* .github/copilot-instructions.md skills/godkit/* docs/agent-portability.md
exit: node --test tests/agents-delegate-checkpoint.test.js tests/subagent.test.js tests/package.test.js
phase: done
created: 2026-11-10T1500Z
---

## Plan
- gpt-6 root: preserve named role skills in native Codex projections, correct worktree assumptions, mark external MCP runner as opt-in, test rendering and sync behavior.
- gpt-6 native_agent_check: exclusive policy/docs seam (rules, godkit skill/routing, portability docs); native-first dispatch, targeted peer messages, bounded reports and agent reuse; regenerate rule copies.
- Join: run targeted tests and package checks, validate generated TOML, exercise native peer messaging using task-local role guidance, record evidence and release claim.

## Execute
- Current source inspected directly; stale map not used. Full map rebuild is outside this focused routing change.
- lib/agents.js:68 projects role skill names plus native scope/messaging/report boundaries; four named roles declare YAML skill lists, and implementer no longer assumes a native worktree.
- AGENTS.md and routing.md prefer native same-session teams; external runner is opt-in in lib/mcp.js and portability docs. Generated host rules and six role definitions per host synchronized.

## Review
- native_team_verify traced runtime/role contracts; its YAML-list compatibility finding fixed and guarded by a Claude round-trip assertion. Two native workers exchanged a targeted question/reply and reported back to root.

## Test
- node --test tests/agents-delegate-checkpoint.test.js tests/subagent.test.js tests/package.test.js: tests 51, pass 51, fail 0.
- npm.cmd run check: rules/hooks/templates in sync; versions all four manifests 1.1.0. Python tomllib parsed all six generated Codex role definitions; agents status all twelve definitions unchanged; git diff --check clean.

## Handoff
- Complete for policy/projection and native peer smoke test. Custom-role auto-discovery by a newly opened IDE session and actual token savings were not measured. Host owns native spawning and permissions; these are prompt contracts, not a new runtime API or hard token enforcement. Project map remains stale and was not trusted.
