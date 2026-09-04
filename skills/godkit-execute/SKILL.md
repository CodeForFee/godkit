---
name: godkit-execute
description: >
  Run planned work through five stages so nothing ships unverified and nothing retries forever:
  pre-execute (validate scope and capability), guard (deny-only), execute (bounded), post-execute
  (verify against the world, not the return value), checkpoint. Includes error recovery — retry
  only on verified advancement — and what to do when a delegated result comes back unproven. Use on
  "execute", "carry out the plan", "run it", "verify this", "it failed again", or when running or
  checking delegated work. Do NOT use for a single edit with an obvious check.
license: MIT
---

# Execute

Work is not done when the edit lands. It is done when something independent of you says so.

## The pipeline

Five stages. Skipping stage 4 is how "done" becomes "done, apparently".

### 1. Pre-execute — before you touch anything

- **Scope**: is this file inside your claim on the board? If not, claim it first.
- **Capability**: do you have the tools, permission and context for this? Missing any → say so and stop. **Fail loud, never half-do.** A silently degraded result is worse than a refusal, because the caller believes it.
- **Inputs**: do the paths exist, do the arguments make sense, is the target what you think it is. Read before you overwrite.

### 2. Guard — deny-only

Guards may **deny or abstain. A guard never turns a "no" into a "yes".** The moment one component can force-allow, every other check on the path becomes advisory.

Standing guards, in order:

- destructive and irreversible (delete, force-push, drop, deploy, send) → confirm with the user first unless already authorized for this exact thing
- outside your claim → stop
- contradicts a board decision → stop and raise it
- secrets, credentials, `.env` → never in output, never in a log entry, never in a commit

### 3. Execute — bounded

Do the work. Bounds live *around* the call, not inside it: a timeout, a retry budget, a max-rounds cap. Unbounded work is not work, it is a hang with good intentions.

**godkit-lazy** governs what you write here. Take the shortest working diff.

### 4. Post-execute — verify against the world

**The return value is not evidence.** The tool saying `ok` proves the tool returned; it does not prove the file changed, the test passed, or the service came up.

| Claim | Weak (do not accept) | Real |
|---|---|---|
| file changed | the edit tool returned | read the changed lines back, or `git diff` |
| tests pass | "should pass now" | run them, paste the count |
| build works | it compiled last time | `tsc --noEmit`, `cargo check`, whatever this repo uses |
| bug fixed | the symptom path works | the symptom path **and** the sibling callers of the function you touched |
| delegated work finished | its report says done | run its verification yourself |

**Report orthogonal outcomes separately.** "14 pass, 2 skipped, 1 unrelated failure" is three facts. Compressing them into "tests pass" is the most common way a broken state gets handed forward as a clean one.

### 5. Checkpoint — record it

After a meaningful step: note what changed and what proved it, in the task file's `## Execute` section. Before a context-risky step (large file dumps, wide searches, long test output), write down the state you would hate to re-derive. At the end of the session this becomes your log entry — see **godkit-handoff**. The recording mechanism itself is a commit — `.agent/` and the code together, right after each verified step — see **godkit-git**.

## Error recovery

**Retry only on verified advancement.** Before retrying, name what is different: an input you changed, something you learned, an external condition that moved. Same inputs plus same state equals same failure — that is not a retry, it is a loop with extra tokens.

Before retrying at all, isolate the cause: reproduce it with the smallest input that still fails, bisect down to the smallest failing case (the last-known-good commit, the specific file, the specific line), and confirm that is actually the cause — not just where the error surfaced — before touching any code. A fix aimed at the wrong cause is itself an unverified retry.

- **Failed twice the same way** → stop retrying. Read the actual error, trace the actual code. The third attempt does not know more than the second.
- **Failed differently each time** → you are guessing. Stop and diagnose — see **godkit-review**.
- **Blocked on something outside your control** (missing credential, a claim you cannot take, a decision only the user can make) → stop, set the task `phase: blocked`, and set `blocked:` to the kind of blocked it is — `needs-decision`, `needs-evidence`, `external-wait`, or `needs-owner`. Log the exact blocker, tell the user. Do not invent a workaround around a permission. An untyped `blocked` is a `resume-blocked` finding, because it leaves the next agent with no idea whether they can act.
- **The same typed blocker twice with nothing advanced** → that is not a retry, it is the loop the rule above names, and the breaker is escalation rather than a third attempt. Record it on the task, say so in your Handoff, and hand it to whoever the blocker points at: the user for `needs-decision`, the claim holder for `needs-owner`. `external-wait` never earns a retry at all — pick up other work.
- **Partial success** → finish every part that is not blocked, then report exactly which parts are outstanding and why. Scaling the task down is the user's call, never yours.

## Cleanup

Anything you started, you stop. Kill the background process, close the handle, remove the scratch file. **Teardown that requests a stop and returns leaves orphans** — wait for it to actually be gone. Stop the listeners before stopping the work, so late output does not surface after the report.

## Output

Work first. Then at most three lines:

`did: <what>. verified: <command → result>. left: <what and why>.`

If nothing was verified, say that in place of a verification. **Never write a verification you did not run.**

## Boundaries

This skill runs seams that **godkit-plan** cut. It does not decide what to build, and it does not replace the protocol in **godkit-handoff** — clock out regardless of how execution went.
