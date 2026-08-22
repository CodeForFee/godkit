---
name: subagent-postmortem
description: >
  Diagnose a run that went wrong — a loop that never ended, context that ran out mid-task, two
  agents that undid each other, work redone because nobody logged it, a subagent that returned
  confidently wrong. Finds the single root cause in how the work was organized and names the
  smallest process change that prevents a repeat. Use when the user says "why did that fail",
  "postmortem", "it looped forever", "we ran out of context", "the agents undid each other", "it
  said done but it wasn't", "why did we do that twice", "/subagent-postmortem", or after any
  multi-agent run that had to be redone. Diagnosis only — it does not fix the code.
---

# Postmortem

One root cause. Not a list of everything that was suboptimal.

## Method

1. **What was supposed to happen** — one line. The exit condition, as stated at the time.
2. **What happened** — one line. From evidence: `.agent/log/`, `git log`, the transcript, the
   error. Not from memory.
3. **The first divergence.** Walk forward until behaviour first differs from intent. The failure
   surfaced later; the cause is here. Everything after the divergence is a consequence, not a
   cause.
4. **Tag it.** Below.
5. **The smallest change that prevents a repeat.** One rule, one gate, one claim. If your fix is
   "be more careful", you have not found the cause.

## Tags

| Tag | Signature |
|---|---|
| `infinite-loop` | same action retried with unchanged inputs and unchanged state |
| `context-overflow` | ran out of window mid-task; state that mattered was never written down |
| `wrong-seam` | the split forced two workers into one file, or made a piece unverifiable alone |
| `scope-creep` | work drifted past its claim; the diff is much bigger than the task |
| `missing-gate` | a result was accepted with no verification, and was wrong |
| `capability-mismatch` | dispatched to a tool that lacked the tools, permission, or window |
| `no-recovery` | failed and stopped with no diagnosis, or retried forever with no advancement |
| `stale-context` | acted on state that had changed — an old board, a fixed bug, a reverted decision |
| `no-handoff` | work was redone or undone because the previous session left no log |
| `claim-collision` | two agents edited one file; both diffs correct alone, broken together |
| `silent-degradation` | a step half-succeeded and reported success; the caller believed it |

## Output

```
Root cause: <tag> at <where — file, seam id, log entry, or turn>.
Chain: <what it caused, one line, only if not obvious>.
Fix: <the one process change>.
```

Example:

```
Root cause: no-handoff at .agent/log/ — the 08-17 cursor session left no entry.
Chain: claude re-fixed B-002 on 08-19 and reverted cursor's guard in the process.
Fix: Stop hook blocks the turn until a log entry for that session exists. Already in hooks/agent-brief.js — it was not installed for Cursor; add the AGENTS.md stub there.
```

## Rules

- **One root cause.** Several tags fitting means you stopped before the first divergence. Keep
  walking back.
- **Evidence, not reconstruction.** Quote the log line, the error, the two conflicting diffs. A
  plausible story is not a diagnosis.
- **Fix the mechanism, not the person.** "The agent should have remembered" is not a fix, because
  the next agent will not remember either. Make it structural: a hook, a claim, a gate, a template
  field.
- **The fix must be smaller than the failure.** A postmortem that recommends a new coordination
  layer has usually misdiagnosed a missing one-line claim.
- No blame section, no timeline table, no severity rating. Three lines and done.
