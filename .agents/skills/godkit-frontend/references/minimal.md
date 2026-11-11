# Frontend variant — editorial minimal

A dial bias and a few hard component rules on top of the base skill — not a new system. Use
when the brief is a docs site, internal tool, note-taking app, or anything that should read as a
calm working surface rather than a marketing page (Notion/Linear-style). Not for a brief that
wants bold color or marketing punch — the monochrome-plus-pastel-accent bias actively fights
that; use the base skill instead.

## Dial bias

| Dial | Lean | Why |
|---|---|---|
| MOTION_INTENSITY | 1–3, near-invisible | present but never noticed: fade + 12px translate, ~600ms, staggered 80ms — treat this as the ceiling, not a starting point |
| VISUAL_DENSITY | 4–6, document-structured | generous but organized, like a page of text, not a gallery |
| DESIGN_VARIANCE | 3–6 | asymmetric bento allowed, but restrained — this is editorial, not experimental |

## Three-role type system

Don't let one font do everything — this preset assigns roles:

| Role | Use | Never |
|---|---|---|
| Geometric sans | body, UI, buttons | for hero display headings |
| Serif | hero headings and quotes only | for body copy or UI chrome |
| Mono | metadata, code, keyboard shortcuts | for anything else |

## Color and structure rules

- Warm monochrome base: off-white/bone background, charcoal text — never pure `#000000` or a
  bright primary-colored section background.
- Color is reserved for small surfaces only: pastel tag/badge backgrounds, never large blocks.
- Hairline `1px` borders replace shadows as the primary separator; radius capped at 8–12px.
- No pill shapes on large containers or primary buttons — pills are for tags and status badges
  only.

## Extra banned defaults

On top of the base list: Inter/Roboto/Open Sans, generic thin-line icon sets used
without a consistent stroke width, heavy `shadow-lg`-class drop shadows, and gradients or
glassmorphism anywhere in the page.

## Scope

Covers palette, type roles, and motion ceiling only — grid mechanics and the general dial process
still come from the base skill. For a bolder, higher-contrast take on a similarly disciplined
grid, see the `brutalist` variant instead.
