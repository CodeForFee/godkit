# Providers and the decomposition ladder

Part of the **godkit** skill, loaded on demand.

## Everything is a provider

An agent is not a special kind of thing. It is a provider behind one interface:

```
scope in  →  verified result + log entry out
```

A Claude subagent, a Cursor session, a Codex run, an MCP tool, a shell command, a cron job — same contract, interchangeable. You do not orchestrate *agents*; you route a seam to whichever provider satisfies it. That makes routing mechanical instead of a vibe:

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
