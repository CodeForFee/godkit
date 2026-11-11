---
agent: "gpt-6.1-sol"
session: "bootstra-hardening-01a1c5f1"
started: "2026-11-11T0043Z"
ended: "2026-11-11T0043Z"
scope: "scripts/install.sh tests/bootstrap.test.js"
status: "done"
skills: "godkit-lazy, godkit-test"
---

## Task

Harden POSIX pinned-runtime parsing, exact reuse and concurrent installation

## Did

scripts/install.sh validates exact Node24 version before constructing runtime paths, accepts only the exact version/platform/archive filename, requires exact cached/downloaded runtime version, preserves damaged or linked caches, and serializes runtime installation with an atomic mkdir lock. Signal handling exits through cleanup. tests/bootstrap.test.js runs real POSIX shell with controlled uname/runtime fixtures for traversal, escaped/raw control characters, exact reuse/refusal and two concurrent installer processes.

## Verified

node --test tests/bootstrap.test.js: 7 tests, 7 pass, 0 fail. git diff --check -- scripts/install.sh tests/bootstrap.test.js: clean. POSIX tests executed through Git sh on Windows without network or real user home; Windows existing installer smoke remains passing.

## Bugs



## Decisions



## Left / next

Native Linux/macOS execution remains for the CI matrix; controlled Git sh fixtures validate POSIX logic, not platform certification. Parent records B-018 and integration.
