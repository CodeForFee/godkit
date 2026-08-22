---
name: godkit-frontend
description: >
  Design taste for UI work: three numeric dials to set from the brief before writing a line of
  CSS, and a banned-defaults list for the specific look every unguided model converges on.
  Use when building a landing page, portfolio, marketing site or any UI from scratch, when
  redesigning an existing screen, or when the user says "make this look less generic", "this
  looks AI-generated", "give it more personality", "redesign this page". Do NOT use for backend,
  API or data-layer work, and do not use for accessibility or functional correctness review —
  those are ordinary review, not a taste question.
license: MIT
---

# Frontend

Unguided, every model reaches for the same defaults. This skill is the fix: set the dials on
purpose, then ban the defaults that show up when nobody does.

## The three dials

Set each 1–10 from the brief before writing anything. A brief that says nothing about them still
implies values — a fintech dashboard implies low variance and low motion; a portfolio for a
motion designer implies the opposite. Guess from context, state the guess in one line, move on.

| Dial | Low | High |
|---|---|---|
| **DESIGN_VARIANCE** | conventional, safe, easy to scan | unconventional layout, real risk |
| **MOTION_INTENSITY** | static or near-static | animation carries meaning, not decoration |
| **VISUAL_DENSITY** | generous whitespace, few elements per view | dense, information-rich |

A dashboard used all day and a landing page seen once for ten seconds want different values on
all three — the dials exist so that difference gets decided, not defaulted.

## The banned defaults

These are not bad choices in isolation. They are what shows up when the dials were never set,
which is how "AI made this" gets said out loud. Pick something instead — the point is a decision
was made, not that any specific alternative is mandatory.

- purple-to-pink gradient hero background
- centered headline over a mesh-gradient or blob background
- exactly three feature cards, equal width, identical structure
- Inter (or system-ui) + `slate-900` text as the unexamined default font/color pair
- a hero, three features, a CTA, a footer — the generic SaaS template shape, present because it
  is what comes up most often, not because the brief asked for it

## Process

1. **Infer the brief.** What is this, who looks at it, how long do they look, once or daily.
   State it in one line if it is not already explicit.
2. **Set the three dials** from the brief, one line each, with the one-word reason.
3. **Choose a real design system**, not the default: a font pairing (not Inter alone), a palette
   with an actual accent color chosen for the brief, a spacing scale. Two rungs of
   **godkit-lazy** apply here too — reuse what the project already has (existing tokens, an
   installed component library) before introducing new choices.
4. **Sketch the motion**, only if `MOTION_INTENSITY` warrants it: what animates, on what trigger,
   and why it helps rather than decorates. Use whatever motion primitive the project already has
   (CSS transitions, an installed animation library) — do not add a new dependency for this.
5. **Pre-flight**: does the result hit any item on the banned-defaults list above? If yes, that
   is not automatically wrong, but it means dial 1 was probably set too low for the brief — check
   before shipping, not after.

## Boundaries

This is a taste pass — layout, motion, hierarchy, defaults. It does not replace accessibility
review (contrast, focus order, semantics), functional correctness, or performance work — those
are ordinary engineering, not a taste question, and stay in whatever skill already owns them in
a given project.
