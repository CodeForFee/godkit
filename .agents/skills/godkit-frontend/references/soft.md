# Frontend variant — calm/premium

A dial bias on top of the base skill, not a new system. Use its process and banned-defaults
list; this file only says what to lean toward for a calm, premium look. Use when the brief calls
for a premium, luxury, or boutique-agency feel — SaaS landing pages, portfolio sites for design
studios, high-end consumer products. Not for data-dense dashboards or admin tools — the
heavy-whitespace bias fights a screen that needs to show a lot at once; use the base skill with
VISUAL_DENSITY set high instead.

## Dial bias

| Dial | Lean | Why |
|---|---|---|
| VISUAL_DENSITY | 2–4 | whitespace is the premium signal here — `py-24` to `py-40` between sections |
| MOTION_INTENSITY | 5–7, spring-only | never linear or `ease-in-out`; custom cubic-bezier or spring physics only |
| DESIGN_VARIANCE | 5–8, pick one archetype and commit | see below — don't blend archetypes mid-page |

## Pick one archetype

State which, once, before building:

- **Glass** — near-black background, soft radial glow, heavy blur, hairline light borders.
- **Editorial warm** — cream/sage background, serif display type, subtle paper-grain texture.
- **Soft structuralism** — near-white background, bold grotesk type, diffused floating shadows.

## Component patterns specific to this preset

- **Shell-and-core containers**: never place a card flat on the background. Wrap it in an outer
  shell (subtle tint, hairline ring, larger radius) with the actual content as an inner core one
  size down — concentric, not flat.
- **Icon-in-circle CTA**: a trailing arrow on a button sits inside its own small circular wrapper,
  not naked next to the label.
- **Eyebrow tag**: a small pill-shaped label above H1/H2, not the heading alone.
- Motion is never instant — every state change interpolates, including hover and active.

## Extra banned defaults

On top of the base list: Inter/Roboto/Arial/system-ui as the display font, thick-stroke
default icon sets, hard `shadow-md`/`shadow-lg` drop shadows, and a symmetric equal-width 3-column
grid with no whitespace variation.

## Scope

This is a look, not a layout engine — grid mechanics, responsive collapse, and motion-performance
rules (transform/opacity only, no scroll-listener animation) are the base skill's job, not
repeated here.
