---
name: godkit-triage
description: >
  Turn a GitHub issue or PR scope into posted comments and reviews, without asking the maintainer
  to do the analysis. Covers resolving artifacts with `gh` instead of asking, reviewing against a
  freshly fetched base rather than a stale local branch, the confidence-and-severity gate that
  decides what is worth posting publicly, treating existing comments as a posting rule rather than
  an analysis one, clustering a batch by shared files, and comparing PRs that target one issue.
  Use when the user says "triage", "review this PR", "look at these issues", "handle the backlog",
  gives issue or PR numbers or URLs, or asks what to reply. Do NOT use for reviewing your own
  uncommitted work — that is a normal review, and orchestration post-mortems are godkit-review.
license: MIT
---

# Triage

The maintainer's side of this should be: hand over a scope, get back posted links, clean results
and drafts. Not a set of questions. Every question you ask is analysis you handed back to the
person who asked you to do it.

## Resolve the scope yourself

`gh` can answer almost anything you would have asked. Ask only when it genuinely cannot.

| Input | What to do |
|---|---|
| a URL | `/issues/N` is an issue, `/pull/N` is a PR. Route it, do not confirm it. |
| a bare number | Try `gh pr view N`; if that fails, `gh issue view N`. Never ask which it is. |
| `#12`, `# 12`, `12` mixed | Normalize to a number list, keep the order, drop exact repeats. |
| "the recent ones" | Take a sensible recent slice, **say which slice you took**, and report what you left. |
| a field `view` lacks | `gh api` — timeline events, review threads, precise search filters. |
| nothing resolvable | Stop with a compact "scope unresolved" line and the command you tried. Not a question. |

Default to the repo's own `origin` unless a URL or the user says otherwise.

Stop without asking only when: no scope resolves, auth or access fails, the request is outside
commenting, or posting would need private context. Then report the attempted command and the
smallest next action.

## Read the right diff

This is the part that silently produces confident, wrong review comments.

**Never review against a local `main`.** It is stale the moment someone else merges, and a diff
against it shows you other people's work as if it were the author's.

1. Fetch the base fresh:
   `git fetch <base-remote> +refs/heads/<base>:refs/remotes/<base-remote>/<base>`
2. Diff from the merge base, not the branch tip:
   `BASE=$(git merge-base HEAD <base-remote>/<base>)` then `git diff "$BASE"...HEAD`
3. **A fork PR's branch does not exist on the base repo.** `gh api .../contents?ref=<their-branch>`
   returns 404 and the ref will not fetch. Use the PR ref: `git fetch <base-remote> pull/N/head:pr-N`
4. **Record the head SHA you reviewed, and re-check it immediately before posting.** If the PR
   moved while you were reading, re-review or abort. A review posted against a diff the PR no
   longer has is worse than no review — it is wrong *and* it looks authoritative.
5. If neither a local nor a GitHub diff can be read, report the failure. Do not review from the
   description.

Take the base branch from the PR's own metadata. `main` is a fallback, and only after fetching.

Green checks are a signal, never a verdict. A failing required check is itself a finding — a
build failure is P0. Passing tests do not prove the changed branch is even exercised, so confirm
suspect logic by reading the source.

## The posting gate

Confidence and severity are **independent axes**, and conflating them is how a review turns into a
list of guesses that the author has to disprove one by one.

- Post publicly only what is **high-confidence AND at least P2**.
- For a public P2, also require that this diff *introduces or worsens* it. Do not raise a P2
  against pre-existing behaviour the diff merely touches, or against a change that is a net
  improvement on what was there.
- A high-confidence P0 or P1 is always worth posting. A **low-confidence P1 is not** — drop it, or
  route it to maintainer notes framed as a hypothesis to check.
- "No findings" means none at any severity. It does not mean "no P0".

Everything real but sub-threshold — nits, bounded risks, pre-existing issues, hunches — goes to
the maintainer, never to a public comment.

| | Meaning |
|---|---|
| `P0` | outage, data loss, security breach, or a broken build |
| `P1` | likely production bug, serious regression, broken compatibility |
| `P2` | correctness, maintainability or missing-test concern at lower risk |

## Existing comments gate posting, not analysis

A prior comment may have caught A and missed B. So **always analyse in full**, then post only what
is genuinely new.

- Non-empty delta → one comment that builds on the prior coverage explicitly and states only the
  new items. Do not restate what is already there.
- Empty delta → post nothing; report "already covered" with the existing link.
- Your own earlier comments count as prior coverage. On a re-run, never stack a near-duplicate.
- Refresh comments *immediately before posting* and fold in anything that landed while you were
  reading.

## Findings

```
[P1] Refresh token survives logout

- Location: src/auth/session.ts:88-94
- Problem: the cookie is cleared but the server-side record is not, so a captured
  token still refreshes after the user logs out.
- Evidence: `logout()` calls `clearCookie` only; `revoke()` is never reached on this path.
- Fix: revoke inside the same transaction as the cookie clear.
- Test: log out, replay the old refresh token, expect 401.
```

Every posted comment carries concrete guidance and a way to check it — or it is only a request
for the smallest missing piece of evidence. No compliments, no summaries, no general advice. For
security issues describe impact and remediation, never an exploit.

## Batches

Cluster by **shared files**, not by artifact type.

- **Related** (same files, same interface, same issue) → review in ONE context. Parallel workers
  cannot see each other's findings, so splitting a related cluster blind guarantees you miss the
  interaction. If it will not fit, split and then **reconcile in a synthesis pass** — never split
  without one.
- **Independent** (disjoint files) → these are real seams and may run in parallel. See
  **godkit-plan**; the cost rules in **godkit-lazy** still apply, so do not spawn a worker for
  three related items.

After the per-artifact pass, one synthesis for the maintainer: which PRs touch the same files and
will conflict, which are duplicate solutions, and which are safe alone but not together.

## Competing PRs

When several PRs target one issue, compare them instead of reviewing each in isolation.

1. The issue's own acceptance criteria are the rubric. Nothing else.
2. Score each on: does it actually resolve the ask, correctness and error paths, test quality,
   blast radius, maintainability.
3. Report the comparison **to the maintainer only**.
4. Publicly, each PR still gets its own gate-passing findings. Never rank authors against each
   other in public.

## What lands in .agent/

Triage is a session like any other, and it ends the same way — see **godkit-handoff**.

- A confirmed bug in **this** repo becomes a `B-NNN` on `.agent/BOARD.md` with its root-cause
  location, not its symptom. That is how the next agent tells "already fixed" from "never looked".
- Posted comment and review URLs go in the log's `## Did`. They are the evidence this ran.
- You commented; you did not fix. Never say a fix was made unless code actually changed.

## Output

```
Reviewed: PR #412 (1x P1), PR #418 (clean)
Posted:   #401 — <comment url>
Skipped:  #399 — already covered by <url>
Failed:   #405 — head moved mid-review, not posted
Notes:    PR #418 duplicates #412 on src/auth/*; merge #412 first.
```

Omit empty categories. For analysis-only requests, replace "Posted" with "Drafted" and include
the text without posting.

## Boundaries

This is the comment plane: resolve scope, read evidence, post comments and reviews. It does not
write code, manage branches, cut releases, or close artifacts. Reviewing your own working tree is
an ordinary review, not this. Diagnosing why an agent *run* went wrong is **godkit-review**'s
Diagnose mode, which judges orchestration and never code. Pressure-testing a decision before it
binds is **godkit-doubt**.
