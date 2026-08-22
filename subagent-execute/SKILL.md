---
name: subagent-execute
description: >
  Run planned work through a five-stage pipeline so nothing ships unverified and nothing retries
  forever: pre-execute (validate scope and capability), guard (deny-only checks), execute
  (bounded), post-execute (verify against the world, not the return value), checkpoint (record
  it). Includes error recovery — retry only on verified advancement — and what to do when a
  delegated result comes back unproven. Use when carrying out a plan with several steps, when
  running or verifying delegated work, when a step failed and you are deciding whether to retry,
  or when the user says "execute", "carry out the plan", "run it", "verify this", "it failed
  again". Do NOT use for a single edit with an obvious check.
---

# Execute

Work is not done when the edit lands. It is done when something independent of you says so.

## The pipeline

Five stages. Skipping stage 4 is how "done" becomes "done, apparently".

### 1. Pre-execute — before you touch anything

- **Scope**: is this file inside your claim on the board? If not, claim it first.
- **Capability**: do you have the tools, permission, and context for this? Missing any → say so
  and stop. **Fail loud, never half-do.** A silently degraded result is worse than a refusal,
  because the caller believes it.
- **Inputs**: do the paths exist, do the arguments make sense, is the target what you think it is.
  Read before you overwrite.

### 2. Guard — deny-only

Guards may **deny or abstain. A guard never turns a "no" into a "yes".** The moment one component
can force-allow, every other check on the path becomes advisory.

Standing guards, in order:

- destructive and irreversible (delete, force-push, drop, deploy, send) → confirm with the user
  first unless already authorized for this exact thing
- outside your claim → stop
- contradicts a board decision → stop and raise it
- secrets, credentials, `.env` → never in output, never in a log entry, never in a commit

### 3. Execute — bounded

Do the work. Bounds live *around* the call, not inside it: a timeout, a retry budget, a
max-rounds cap. Unbounded work is not work, it is a hang with good intentions.

Ponytail governs what you write here. Take the shortest working diff.

### 4. Post-execute — verify against the world

**The return value is not evidence.** The tool saying `ok` proves the tool returned; it does not
prove the file changed, the test passed, or the service came up.

| Claim | Weak (do not accept) | Real |
|---|---|---|
| file changed | the edit tool returned | read the changed lines back, or `git diff` |
| tests pass | "should pass now" | run them, paste the count |
| build works | it compiled last time | `tsc --noEmit`, `cargo check`, whatever this repo uses |
| bug fixed | the symptom path works | the symptom path **and** the sibling callers of the function you touched |
| subagent finished | its report says done | run its verification yourself |

**Report orthogonal outcomes separately.** "14 pass, 2 skipped, 1 unrelated failure" is three
facts. Compressing them into "tests pass" is the single most common way a broken state gets handed
forward as a clean one.

### 5. Checkpoint — record it

After a meaningful step: note what changed and what proved it. Before a context-risky step (large
file dumps, wide searches, long test output), write down the state you would hate to re-derive.
At the end of the session, this is your log entry — see **subagent-handoff**.

## Error recovery

**Retry only on verified advancement.** Before retrying, name what is different: an input you
changed, something you learned, an external condition that moved. Same inputs plus same state
equals same failure — that is not a retry, it is a loop with extra tokens.

- **Failed twice the same way** → stop retrying. Read the actual error, trace the actual code. The
  third attempt does not know more than the second.
- **Failed differently each time** → you are guessing. Stop and diagnose: run **subagent-postmortem**.
- **Blocked on something outside your control** (missing credential, a claim you cannot take, a
  decision only the user can make) → stop, log `status: blocked` with the exact blocker, tell the
  user. Do not invent a workaround around a permission.
- **Partial success** → finish every part that is not blocked, then report exactly which parts
  are outstanding and why. Scaling the task down is the user's call, never yours.

## Cleanup

Anything you started, you stop. Kill the background process, close the handle, remove the scratch
file. **Teardown that requests a stop and returns leaves orphans** — wait for it to actually be
gone. Stop the listeners before stopping the work, so late output does not surface after the
report.

## Output

Work first. Then at most three lines:

`did: <what>. verified: <command → result>. left: <what and why>.`

If nothing was verified, say that in place of a verification. Never write a verification you did
not run.
