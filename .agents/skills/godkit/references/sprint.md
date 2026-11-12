# Sprint mode

Part of the **godkit** skill, loaded on demand.

## Sprint mode

More than one seam pointed at one goal is a sprint. `godkit sprint new "<goal>"` opens
`.agent/sprints/S-NNN.md`; the CLI keeps the file and checks the tasks, you cut the waves.

The loop, and it does not vary:

**goal → waves of file-disjoint seams → dispatch within granted capacity → join gate → next wave.**

- **A wave is a set of ready tasks whose file scopes do not overlap.** Pin shared interfaces first.
  Task N+1 touching a file already claimed in this wave drops to the next wave — it does not run in
  parallel and get merged hopefully. This is "one owner per file", stated at wave level.
- **Dispatch ready seams within root's shared host slot budget.** Follow the hierarchy, branch
  allowances and capacity fallbacks in [routing.md](routing.md#native-session-teams); a wave is
  not permission to overbook or create recursive workers. Do useful own work while capacity is busy.
- **Every wave ends at a scoped join gate**: its owner verifies the seams compose. Root runs one
  full final gate after branch integration, rather than repeating the suite at every level. Without
  it you do not have a wave, you have several edits that happened to overlap in time. Each seam's
  own exit condition proves the seam; the gate proves they still compose.
- **Route each seam down the cost ladder above.** A sprint does not change the ladder, it runs it
  several times at once. Cheap tier for mechanical seams, strong tier for judgment, in the same wave.
- **`godkit sprint close` refuses** while any named task is unfinished or finished with an empty
  `## Test`. It is the same contract `godkit verify` applies, scoped to this goal.

Report one line per wave, never a narrative:

`wave 2/4 · 3 tasks · verified: npm test → 41 pass · next: T-009 T-010`
