---
id: T-018
title: Native Antigravity roles with task skills and truthful readiness
owner: gpt-6.1-sol
scope: lib/agents.js lib/install.js lib/doctor.js bin/godkit.js tests/* docs/* skills/godkit/references/routing.md .agents/agents/* .agents/skills/* CHANGELOG.md
exit: full tests, package/type gates, native schema/skill checks and honest installed-CLI discovery audit
phase: done
created: 2026-11-11T0029Z
---

## Plan
- Generate documented Antigravity Markdown roles under .agents/agents using native tool names, inherited model, sandbox execution and role skill paths; keep native team boundaries.
- Ensure required project skills are installed with ownership protection; include new projections in release rollback snapshots and readiness digests.
- Update canonical global skill discovery and native routing/docs; validate real CLI agent discovery without starting an external model run.

## Execute
- Official Antigravity subagents/customization discovery docs establish .agents/agents, .agents/skills and ~/.gemini/config scopes. Existing Godkit source generated only Claude/Codex roles. Current source used directly; stale map not trusted.
- Generator now creates six native YAML roles with documented tool names, inherited model and sandbox policy; role bodies load exact skill files on demand and require native delegation. Optional relative dependency paths were deliberately avoided because their base is undocumented.
- agents sync refreshes the full coordinator catalog while workers read only required skills; init avoids duplicate copies and honors --no-skills. Canonical global skills are copied per skill, release snapshots include native roles, and doctor hashes selected local/global Antigravity assets without claiming execution.
- Native workers handled readiness, docs/artifact checks, metadata investigation and a delayed installer review fix in parallel. Current workspace has six role projections and sixteen skills; temporary discovery fixtures cleaned.

## Review
- Installed AGY1.5.5 metadata experiment: global primary-selectable fixture listed, workspace and subagent-only fixtures omitted. agy agents is not a native execution test. Keep mainAgent false and require real-host invocation evidence.
- Official build-plugin docs confirm send_message remains available despite a role tools allowlist; no invented messaging alias needed. Source/record validation preserves user roles/skills and actual-use attribution.
- Supplementary B-018 from earlier installer review: strict POSIX lock paths, exact runtime pin and concurrency-safe cache installation; controlled tests verified independently by root.
- Independent final reviewer found standalone uninstall ignored custom GEMINI_HOME; shared Antigravity base selection now follows that override for canonical/legacy locations. Isolated install/dry-run/uninstall preserves foreign skills and removes owned ones (4/4 tests).

## Test
- npm test: 378 tests, 376 pass, 0 fail, 2 skipped; actual packed artifact validates all six Antigravity roles and workspace skill paths.
- npm run check and npm run typecheck PASS; focused AGY/bootstrap final11/11 PASS; previous agent/doctor/CLI42/42 PASS; git diff --check clean.
- Real agy metadata commands and isolated git/non-git fixtures executed without model prompts; only primary/global listing demonstrated. No external model CLI or simulated native invocation was used as proof.

## Handoff
- Complete for source, current project setup and automated gates. Start/reload an Antigravity session to load changed customizations. Native invocation/peer runtime evidence must originate there; Codex has not executed AGY's invoke_subagent. No publish or real home configuration change.
- Preserve the user's pre-existing B-006 removal in BOARD.md as an unstaged change; it is not part of this work. Stale map remains untrusted.
