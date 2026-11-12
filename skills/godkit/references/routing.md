# Providers and the decomposition ladder

Part of the **godkit** skill, loaded on demand.

## Native session teams

Use the host's native same-session agent tools when delegation earns its cost. Tool names vary by runtime: discover the available spawn, follow-up, message, wait and stop capabilities rather than assuming an API. CLI delegation and MCP `godkit_agent` start external processes and require an explicit external-run request. If native agents are unavailable, say so and continue useful work in this turn; never silently substitute an external run.

### Hierarchy and useful decomposition

- **Root decides for the user.** The root owns the user's goal, decomposition, shared capacity, cross-branch dependencies and final gate. Do not ask the user to manage the team. Most work stays in this turn or goes to a direct worker.
- **At most two delegation edges:** `root → godkit-lead → worker`. Direct `root → worker` is also valid. A worker never spawns another agent, including for review or retry. A lead never creates another lead. If a branch needs more levels, return it to root to re-cut.
- **A lead must earn its place.** Use `godkit-lead` only for a coherent branch with at least two meaningful, independent seams. A lead does substantive implementation, investigation or integration alongside its workers; it is not a forwarding layer. Give ordinary single seams directly to a worker.
- **Roles and skills:** choose the needed role from `agents/*.md` and only the skills its seam needs. Use the host's custom agent definition when available; otherwise give the native worker the role file and needed skill paths. Inheriting a skill catalog does not mean every skill should run.

### One shared slot budget

- **Count everyone.** The host's known live-agent ceiling includes root, leads, workers and agents waiting for results. Root assigns each branch a live-slot allowance, including its lead, and keeps root plus direct workers plus branch allowances within the shared ceiling. A branch allowance is not a separate pool. Do not overbook or hold slots for hypothetical work.
- **Unknown ceiling:** do not invent capacity from a role file, prompt or another host's defaults. Root mediates the work sequentially until the host's ceiling is known. Host hard limits remain enforced by the host; prompt allowances are coordination rules, not a hard token meter.
- **Start small.** A lead starts at most two workers, only within its granted allowance and available global slots. Grow only when there is proven, ready work with disjoint files and root has granted the capacity. Reuse workers for follow-ups; stop completed idle agents when their slots are needed elsewhere.
- **No slot available:** do useful work in your own scope and request reallocation from root. Do not spawn-and-retry, reserve idle agents or create a replacement agent to evade a limit. A waiting agent still consumes a slot until the host releases it.

### Scope and task contract

- **Envelopes are not edit claims.** Root and leads may coordinate broad scope envelopes, but only actual editors own exclusive leaf claims. Claim only files you will edit; a lead takes over a worker's files only after its claim is released. In a native team, root alone updates `BOARD.md`, recording claims for the actual editors and coordinating ownership changes. A message does not grant edit ownership.
- **Pin shared interfaces first.** Agree and record shared types, API contracts and ownership before backend/frontend or other dependent parallel edits. Serialize any shared-file change; parallelize only disjoint file sets whose dependencies are ready.
- **Lean brief:** goal, file pointers and exclusive scope, exit condition, verification command, dependencies, parent and live-slot allowance. Prefer task-only context when configurable (`fork_turns: "none"` in Codex); do not paste the conversation. Record hierarchy, allowances and interface dependencies under the existing task's `## Plan`; no new task schema or duplicate plan files. Context inheritance varies by host; do not promise a hard token limit.

### Communication, evidence and recovery

- **Targeted messages only:** dependencies, blockers, interface changes or evidence another agent needs. Use native messaging when available; otherwise root relays. No broadcasts, obligatory status exchanges or polling loops. Durable cross-session handoffs go in `.agent/THREAD.md`.
- **Reports:** at most ten lines: result, actual files, check and deciding output, remaining blocker. Workers run scoped checks; the lead verifies and integrates its subtree with the relevant integration checks. Root verifies cross-branch composition and runs one full final gate. Do not repeat the whole suite at every level; rerun only when a changed input, failure or unresolved concern justifies it.
- **No unchanged-input retry.** Identify verified advancement before retrying. A new agent, another model or a fresh task does not make the same failing inputs new. Escalate the cause to the parent and do other useful work rather than hiding a retry in another spawn. See **godkit-execute** for diagnosis and typed blockers.
- **Host fallbacks:** if nested spawning is absent, root may spawn on the lead's behalf while preserving its logical parent, scope and allowance; the same two-edge limit applies. If messaging is absent, root relays dependencies and evidence. Neither fallback authorizes an external CLI/MCP run.
- **Permissions and isolation:** native workers inherit the parent's permissions. A read-only role is an instruction, not a separate sandbox. Provide or explicitly create a worktree when isolation is needed; a role description or generated agent file does not create one.

### Antigravity native recipe

Inspect `/agents`; use `invoke_subagent` with a scoped brief and an explicit workspace choice (`inherit`, `branch` or `share`), within the hierarchy and shared slot budget above. Children start without conversation history. Read the exact skill files listed in the role body only as needed. Use available native messaging for brief dependency/blocker notes to known teammate IDs; otherwise root relays. The parent verifies scoped results. Never silently use `agy --print` or `godkit_agent`. [Native subagent behavior](https://antigravity.google/docs/subagents).

Antigravity role files are subagent-only. The inspected CLI 1.5.5 metadata command `agy agents` omitted workspace and subagent-only roles; use an actual parent `invoke_subagent` result to validate runtime support. Never relabel static role files or a primary-agent listing as a successful native team run.

For peers, use native `send_message` with `Recipient` and `Message`; Antigravity provides this coordination tool even when a role limits its built-in tools. [Tool contract](https://antigravity.google/docs/hooks/#agent-collaboration), [allowlist behavior](https://antigravity.google/docs/build-plugins/#subagents).

## Everything is a provider

An agent is not a special kind of thing. It is a provider behind one interface:

```
scope in  →  verified result + log entry out
```

A native subagent, another session, an MCP tool, a shell command or a cron job can satisfy this contract, but their execution and permission boundaries differ. Choose among providers allowed by the user's request and the native session policy above:

**1. Which providers CAN do this seam?** Capability first — tools, permissions, repo access, context window. A provider missing one is rejected loud, never dispatched-and-hoped. A silently degraded result is worse than a refusal, because you will believe it.

**2. Of those, which is cheapest?** Use a command for questions it can answer exactly; reserve stronger models for work that needs their judgment.

### The cost ladder

Stop at the first rung that clears the capability bar:

0. **Can a command answer it?** `rg`, the test suite, `tsc --noEmit`, `git log`. Free, cannot hallucinate, and it is the verification anyway. Most "check whether X" questions die here.
1. **Can this turn do it?** You already hold the context; a spawn pays a cold start to re-derive what you know.
2. **Can a small or local model do it?** Mechanical edits, filling stubs, a test from a named behaviour, renames, summarizing a diff.
3. **Does it need repo-wide reasoning?** Root cause, a refactor spanning modules, "why is this broken", cutting the seams. Strong tier, and worth it.
4. **Does it need several at once?** Use ready disjoint seams within root's granted capacity; a lead needs at least two meaningful independent seams. Verify at the owning level, then run the full final gate at root.

The expensive tier is for *judgment*, not for typing. If the seam has a known answer shape and a mechanical check, it belongs a rung lower.

Who is actually available is `## Roster` on the board. No roster, no routing — you would be guessing at capabilities.

## The work decomposition ladder

For the work itself, stop at the first rung that holds:

1. **Fits in this turn?** Do it. No decomposition, no delegation, no plan document.
2. **Sequential in this session?** Step through it with checkpoints.
3. **Has natural seams?** Split on the seams, each with scope, exit condition and verification. Seams split on **file boundaries**, never on abstract layers that share files.
4. **Needs a specialist?** One scoped worker, with only the tools that scope needs.
5. **Needs genuine parallelism?** Dispatch ready **disjoint file sets** within the shared slot budget, then verify their composition. Root owns the full final gate.
6. **Needs iteration to converge?** Goal-driven loop with a hard max-rounds cap and a measurable exit. No cap means no loop.
7. **Only then:** full multi-phase orchestration.

Most work is rung 1 or 2. The ladder runs *after* you understand the task, never instead of understanding it — a clean decomposition of the wrong problem is still the wrong problem, now in four pieces.
