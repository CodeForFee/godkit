---
name: godkit-doubt
description: >
  Pressure-test a non-trivial decision before it goes on the board — once it is under Decisions in
  .agent/BOARD.md, every future agent treats it as binding. Use before writing a Decisions entry,
  when a choice is hard to reverse, before locking an architectural choice others will build on, or
  on "are you sure", "argue the other side", "is this actually right". Do NOT use for postmortems
  on a decision already acted on — that is godkit-review's Diagnose mode.
license: MIT
---

# Doubt

A decision on the board binds every agent that reads it after you. Getting it argued before it
is written costs one pass; getting it wrong costs every session that trusted it.

## When

Before the line goes under `## Decisions` in `.agent/BOARD.md` — not after. Once it is there,
**godkit-handoff**'s clock-in step says the next agent checks it and is bound by it. This skill
is the gate before that happens, not a way to revisit what already went in.

Reserve it for decisions worth the pass: hard to reverse, more than one future agent will build
on it, or the reasoning behind it feels thinner than the confidence it is stated with. A
same-session, easily-undone choice does not need this — that is what **godkit-lazy**'s "ship it
and question it in the same response" already covers.

## The pass

1. **State the decision and its reason, one line each.** If the reason will not fit in one line,
   the decision is not actually settled yet.
2. **Argue the strongest case against it**, from a fresh read — not the reasoning that produced
   it. What would make this wrong? What did picking it *not* consider?
3. **Check it against `.agent/BOARD.md` and `.agent/MAP.md`** for a contradiction — a decision
   that quietly conflicts with an existing one or the actual architecture is worse than no
   decision, because it looks authoritative.
4. **Resolve.** The adversarial pass did not change your mind → record the original, plus the
   counter-argument you checked in one line, so the next agent sees the question was actually
   asked. It did change your mind → record the better decision. Never record both as if
   undecided — a board entry is a commitment, not a running debate.

## Output

```
Decision: httpOnly cookie over localStorage for the refresh token.
Against: localStorage is simpler and avoids a CSRF-token dance.
Holds because: XSS exposure on this app includes third-party widgets already in the page —
   the CSRF cost is smaller than that exposure. Recording as-is.
```

## Boundaries

Pre-commit only — on a decision not yet acted on. A decision already acted on that went wrong is
**godkit-review**'s Diagnose mode, which works from evidence of what actually happened, not from
argument. This skill does not decide *what* the options are — it pressure-tests a decision
already reached.
