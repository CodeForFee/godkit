---
name: godkit-output-enforcement
description: >
  Guards against generated code (or any generated deliverable) being handed over stubbed,
  truncated, or described instead of written. Locks a deliverable count before generating, bans
  placeholder patterns like "// rest of implementation" and "and so on", and defines how to pause
  cleanly at a token-limit boundary instead of compressing or skipping ahead. Use whenever
  producing a full file, several files, or any "give me the whole thing" deliverable — not just
  UI work. Do NOT use for whether a delegated task actually succeeded (run its check, don't read
  its prose) — that's **godkit-execute**'s post-execute stage.
license: MIT
---

# Output Enforcement

A partial deliverable that looks finished is worse than an honest "not done" — the reader has no
signal to go check. This skill is the discipline against shipping the first.

## Banned patterns

Hard fails. If any of these would appear in the output, the output isn't done — keep writing.

| Where | Banned |
|---|---|
| Code | `// ...`, `// rest of implementation`, `// TODO`, `// similar to above`, `// add more as needed`, a bare `...` standing in for real code |
| Prose | "let me know if you want me to continue", "for brevity", "the rest follows the same pattern", "and so on" (replacing actual content) |
| Structure | a skeleton where a full implementation was asked for; first and last section shown, middle skipped; one example plus "repeat for the rest"; describing what the code should do instead of writing it |

## Process

1. **Scope.** Before generating, count the deliverables the request implies — files, functions,
   sections, list items. Write the number down.
2. **Build.** Generate every one of them completely. No "extend this later" placeholders.
3. **Cross-check.** Before handing it over, recount against step 1. Short by even one → the
   response isn't finished, not "finished with a note."

## Hitting a length limit mid-deliverable

Do not compress what's left to make it fit, and do not skip to a conclusion. Finish the current
unit at a clean boundary — end of function, end of file, end of section — at full quality, then
stop and say so explicitly:

```
[PAUSED — 2 of 5 files complete. Send "continue" to resume from: components/Card.tsx]
```

On "continue", resume exactly there. No recap, no re-summarizing what's already done.

## Before finalizing

- No banned pattern anywhere in the output.
- Every deliverable from the scope count is present and finished, not sketched.
- Every code block is code that runs, not a description of code.
- Nothing was shortened to fit — if it didn't fit, it was paused, not trimmed.

## Boundaries

This governs the completeness of what gets generated, not whether generated code actually works —
running it and reading the real output is **godkit-execute**'s post-execute stage. It isn't
frontend-specific; it applies to any generated deliverable, code or otherwise.
