---
id: T-020
title: Bounded native root-lead-worker teams
owner: gpt-6
scope: lib/agents.js agents/godkit-lead.md tests/agents-delegate-checkpoint.test.js tests/antigravity-agents.test.js tests/release-artifact.test.js tests/fixtures/rule-lines.tsv AGENTS.md skills/godkit/* skills/godkit-plan/SKILL.md skills/godkit-execute/SKILL.md docs/agent-portability.md README.md generated host rules, roles and workspace skill copies
exit: npm test && npm run typecheck
phase: done
created: 2026-11-12T0418Z
---

## Plan
- Root gpt-6: role source, renderer, regression checks, generated copies and final join; policy worker owns only canonical routing/skills/docs and generated always-on rules under its separate claim.
- Parent T-020; root owns BOARD. Policy seam and renderer seam have disjoint files; generated skill sync waits until policy handoff. godkit: shared working tree with exclusive file claims for this bounded native session; use worktrees if ownership or branch isolation becomes necessary.
- Native smoke after policy seam: one lead plus two read-only workers and root (host ceiling four); finite two-leaf queue, no worker delegation, peer exchange, zero-slot and root-mediated fallback scenarios.
- No stale graph reliance: inspect current sources for this focused change, following T-016 precedent; a full map refresh is a separate repository-wide task.

## Execute
- Switched clean main to feat/bounded-agent-teams before editing; claimed renderer/generated and policy seams separately.
- agents/godkit-lead.md and lib/agents.js: reusable bounded native lead, leaf-only workers and consistent host contracts; Antigravity grants invoke_subagent only to the lead, Claude lead inherits native tools.
- skills/godkit/references/routing.md is the detailed policy; related skills, README and portability docs link to it. Regenerated 21 host roles, always-on rules and five modified workspace skill files; install markers now match package 1.1.3.
- tests cover all host boundaries, native spawn allowlist, package lead presence and updated nine intentional rule replacements; AGENTS remains under the existing 5120-byte cap (5109 bytes), without loosening any budget.

## Review
- /root/team_policy/renderer_review and /root/team_policy/policy_review: no additional correctness findings; root fixed the three final-suite failures (old six-role assertion, nine historical rule rows, and 13-byte always-on overflow).
- Reused /root/team_policy as smoke lead: zero-slot phase spawned nobody; root then granted branch allowance three (lead plus two workers), preserving host ceiling four including root.
- Observed leaf reviewer permission-agreement exchange; lead independently asserted all 21 exact projections and boundaries. Root actually dispatched a follow-up to the existing renderer worker and relayed evidence for simulated missing nested-spawn/messaging capabilities; this host supports both. No third worker or recursive worker spawn.

## Test
- node --test tests/agents-delegate-checkpoint.test.js tests/antigravity-agents.test.js: 23 passed, 0 failed; npm run typecheck: exit 0.
- First npm test: 376 passed, 3 failed, 2 skipped; fixed all three; node --test tests/package.test.js tests/release-artifact.test.js: 20 passed, 0 failed.
- Second npm test: 378 passed, 1 failed, 2 skipped; remaining failure is intermittent POSIX installer fixture timing (B-019), unchanged by T-020. Isolated node --test --test-name-pattern 'POSIX runtime lock prevents concurrent installers' tests/bootstrap.test.js: 1 passed, 0 failed.
- npm test -- --test-concurrency=1: 381 tests, 379 passed, 0 failed, 2 skipped (351369ms); serialized file execution controls cross-file load. npm run check and npm run typecheck passed.
- Native smoke passed; node projection status/sync: 21 unchanged; five changed skill sources equal installed copies; npm run check passed; git diff --check clean.

## Handoff
- Complete on feat/bounded-agent-teams; no publish or merge. Separate follow-up B-019 remains. Live Antigravity/Claude nested spawning and quantitative token savings are not measured; host capabilities and hard native limits remain host-owned. Evidence: log/2026-11-12T0456Z-gpt-6-01a1cdf4.md.
