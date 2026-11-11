---
id: T-019
title: Publish npm1.1.3 with gated OIDC release
owner: gpt-6.1-sol
scope: package.json package-lock.json .claude-plugin/plugin.json .codex-plugin/plugin.json gemini-extension.json CHANGELOG.md scripts/runtime-lock.json scripts/install.ps1 scripts/install.sh tests/bootstrap.test.js .agent/*
exit: npm latest1.1.3 matches successful gated release and GitHub assets
phase: execute
created: 2026-11-11T0147Z
---

## Plan
- Preserve existing v1.1.0 tag (old test failure); release latest source as1.1.3 using nine-job OS/Node gate and OIDC provenance.

## Execute
- npm registry latest1.0.0; origin main5a0cfd0; old v1.1.0 run42184539396 failed missing board fixture before publishing. Current board committed.
- Synchronized four manifests, package lock, both installers and runtime lock; bootstrap fixtures read package version instead of a stale release literal. Native read-only reviewer audited npm122-file payload and mandatory pipeline gates.

- Initial v1.1.1 run42941748217 correctly blocked publication: checksum fixture assumed no empty parent directory; macOS aliases /var and /private/var broke test expectations and legacy ownership lookup. Native workers own separate fixes; old tags preserved.

- Fixed canonical source/root ownership comparisons with alias/foreign-link regression; canonical doctor fixture and deterministic Unicode terminal fixture; PowerShell uses .NET SHA256 instead of unavailable Get-FileHash. POSIX checksum regression requires no payload/lock residue, permits empty parent.

- v1.1.2 run42955436278 passed7/9 matrix jobs but exposed macOS22 checkpoint stat-cache reuse and Windows22 native cpSync skipping Unicode directories. Rebuilt private checkpoint index from tree (real index untouched); regression fails before fix. Explicit cpSync filter uses JS walker, verified in Node22 source; actual next matrix pending.

## Test
- npm test:378 total,376 pass,0 fail,2 skipped. After version bump/bootstrap fixture repair:8/8 bootstrap+actual packed artifact PASS. check/typecheck PASS. Cross-platform remote gate pending. Final affected bootstrap/doctor/ownership/artifact38/38 and logo fixture PASS; check/typecheck PASS.

## Handoff
- User explicitly requested npm publication; next commit/tag/push is authorized. Do not claim published until registry and workflow evidence confirm. Stale map not used.
