---
id: T-017
title: Portable runtime, verified onboarding and safe release activation
owner: gpt-6.1-sol
scope: bin/* lib/runtime.js lib/install.js lib/hostmcp.js lib/releases.js lib/doctor.js lib/capabilities.js scripts/* tests/* package.json .github/workflows/* docs/installation.md README.md CHANGELOG.md
exit: npm run check and npm test plus packed-artifact, bootstrap and readiness smoke checks
phase: done
created: 2026-11-10T1523Z
---

## Plan
- Root: absolute runtime paths across hooks/MCP/git, init errors and self-source guard, CLI readiness and release integration.
- bootstrap_release: immutable checked release staging, transactional activation/rollback, pinned checksum runtime bootstrap PS/sh with offline fixtures.
- readiness: machine-readable truthful readiness, real MCP health probe, supported versus observed host capabilities, own-only repair callback.
- release_quality: cross-platform packed-artifact CI, dev-only type checks, performance metrics, installation docs and package allowlist.
- Four complete deliverable groups; no runtime dependencies, no external AI-agent processes, preserve user config and .agent. Source and current tests govern; stale project map is not trusted.

## Execute
- Claims are file-disjoint and workers share interfaces through native messages. Root runs the integration gate after all focused checks.
- Implemented pinned PS/sh runtime bootstraps, immutable checked releases, journaled activation/rollback, absolute GUI runtime paths and owned-only host merges. Existing links, foreign registrations, configuration errors and concurrent edits have explicit recovery/refusal paths.
- Implemented truthful doctor JSON/repair/evidence with asset digests, self-source init guard, global uninstall, development type checks, metrics, packed offline installer tests and three-platform CI/release gates. Earlier native-team/skill-log changes preserved.

## Review
- Integration review fixed unstaged npx doctor repair, explicit init target snapshot, stale evidence promotion, foreign Claude registration replacement, unjournaled rollback and legacy link migration. Restored the pre-existing runtime test file after detecting a test filename collision; new coverage is in absolute-runtime.test.js.

## Test
- npm test: tests 366, pass 364, fail 0, skipped 2; actual tarball plus Windows PS offline standalone tarball installer included.
- npm run check and npm run typecheck pass; sh -n via Git's sh.exe and PowerShell AST syntax pass; git diff --check clean. Final focused install/registration/bootstrap/release checks: 27/27.
- npm pack dry-run: 220351 bytes compressed, 638016 unpacked, 122 entries; zero runtime dependencies. Metrics: CLI median54.47ms, brief156.73ms, MCP init51.98ms/ping0.159ms/RSS64253952 bytes on Windows x64 Node26.5; context estimate1372 tokens excluding host catalog/task skills.

## Handoff
- Implementation and local gates complete. npm/GitHub not published. macOS/Linux execution and real IDE trust/native parity remain CI/manual checks, never inferred from mocks.
- Root's optional fresh official-runtime Windows recheck was rejected by automatic approval review with only "blocked by policy"; existing checksum/rollback/packed existing-runtime checks pass. Bootstrap worker reported a prior real private Node24 smoke; root did not represent it as independently rerun.
- Stale project map was not trusted or rebuilt. Two workers hit a host usage limit after code/tests landed; root integrated and independently reran their focused/full checks. No ongoing claims should remain.
