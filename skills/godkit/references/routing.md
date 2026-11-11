# Providers and the decomposition ladder

Part of the **godkit** skill, loaded on demand.

## Native session teams

Use the host's native same-session agent tools when delegation earns its cost. Tool names vary by runtime: discover the available spawn, follow-up, message, wait and stop capabilities rather than assuming an API. CLI delegation and MCP `godkit_agent` start external processes and require an explicit external-run request. If native agents are unavailable, say so and continue useful work in this turn; never silently substitute an external run.

- **Leader:** own the user's scope, file ownership and final join. Use the smallest team that clears the task, within the host's concurrency limits. Reuse an existing worker for follow-up work instead of spawning a duplicate. Workers do not spawn recursively by default; stop idle members when their work is finished.
- **Roles and skills:** choose a named role from `agents/*.md` (explorer, planner, implementer or reviewer) and only the skills its seam needs. Use the host's custom agent definition when available; otherwise give the native worker the role file and needed skill paths to read. Inheriting a skill catalog does not mean every skill should run.
- **Task contract:** give each worker file scope, a checkable exit condition, a verification command, and a short task brief with `file:line` pointers. Avoid copying the whole conversation by default. Context inheritance depends on the host; do not assume automatic sharing or promise a hard token limit.
- **Peer messages:** use the actual native messaging tool, when available, for a targeted dependency, blocker, interface change or evidence another worker needs. Otherwise route it through the leader. Notify the leader when scope or ownership needs to change; a message does not grant edit ownership. No obligatory chatter. Use `.agent/THREAD.md` for durable handoffs across sessions.
- **Reports and join:** ask for at most ten lines: result, files changed, check and deciding output, remaining blocker. The leader runs the required checks against the resulting files and integrates the result before declaring completion.
- **Permissions and isolation:** native workers inherit the parent's permissions. A read-only role is an instruction, not a separate sandbox. Provide or explicitly create a worktree when isolation is needed; a role description or generated agent file does not create one.

## Everything is a provider

An agent is not a special kind of thing. It is a provider behind one interface:

```
scope in  →  verified result + log entry out
```

A native subagent, another session, an MCP tool, a shell command or a cron job can satisfy this contract, but their execution and permission boundaries differ. Choose among providers allowed by the user's request and the native session policy above:

**1. Which providers CAN do this seam?** Capability first — tools, permissions, repo access, context window. A provider missing one is rejected loud, never dispatched-and-hoped. A silently degraded result is worse than a refusal, because you will believe it.

**2. Of those, which is cheapest?** Running the strongest model on a seam a grep could answer is the most common waste in agent work, and it is invisible: the result is correct, so nobody notices you paid 50x for it.

### The cost ladder

Stop at the first rung that clears the capability bar:

0. **Can a command answer it?** `rg`, the test suite, `tsc --noEmit`, `git log`. Free, cannot hallucinate, and it is the verification anyway. Most "check whether X" questions die here.
1. **Can this turn do it?** You already hold the context; a spawn pays a cold start to re-derive what you know.
2. **Can a small or local model do it?** Mechanical edits, filling stubs, a test from a named behaviour, renames, summarizing a diff.
3. **Does it need repo-wide reasoning?** Root cause, a refactor spanning modules, "why is this broken", cutting the seams. Strong tier, and worth it.
4. **Does it need several at once?** Fan out cheap workers over disjoint files, join with one strong reviewer and one full test run.

The expensive tier is for *judgment*, not for typing. If the seam has a known answer shape and a mechanical check, it belongs a rung lower.

Who is actually available is `## Roster` on the board. No roster, no routing — you would be guessing at capabilities.

## The work decomposition ladder

For the work itself, stop at the first rung that holds:

1. **Fits in this turn?** Do it. No decomposition, no delegation, no plan document.
2. **Sequential in this session?** Step through it with checkpoints.
3. **Has natural seams?** Split on the seams, each with scope, exit condition and verification. Seams split on **file boundaries**, never on abstract layers that share files.
4. **Needs a specialist?** One scoped worker, with only the tools that scope needs.
5. **Needs genuine parallelism?** Fan out over **disjoint file sets**, then gate on the join — one agent runs the full suite after the merge.
6. **Needs iteration to converge?** Goal-driven loop with a hard max-rounds cap and a measurable exit. No cap means no loop.
7. **Only then:** full multi-phase orchestration.

Most work is rung 1 or 2. The ladder runs *after* you understand the task, never instead of understanding it — a clean decomposition of the wrong problem is still the wrong problem, now in four pieces.
