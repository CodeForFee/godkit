# Frontend variant — brutalist (beta)

An experimental Swiss-print/terminal preset. A dial bias and a hard rule set on top of the base
skill — high commitment, not a light touch. Use only when the brief explicitly wants brutalist,
industrial, blueprint, or terminal aesthetics, or for portfolios and dev-tool UIs leaning
deliberately technical. Do not reach for this as a guess when a brief is silent on style — it
reads wrong on anything conventional; use the base skill's normal inference step instead.
Confirm the brief actually wants this before applying it; it is not a safe fallback.

## Dial bias

| Dial | Lean | Why |
|---|---|---|
| DESIGN_VARIANCE | 8–10 | the whole point is rejecting conventional web layout |
| MOTION_INTENSITY | 3–5, mechanical | sharp transitions, not spring physics — this preset should feel engineered, not soft |
| VISUAL_DENSITY | bimodal, not uniform | dense monospace data clusters next to large empty zones; avoid one uniform density across the page |

## Pick one substrate, never mix

| Mode | Background | Text | Accent | Typography |
|---|---|---|---|---|
| Swiss print | off-white/newsprint | near-black | one red, used sparingly | massive uppercase grotesque headers |
| Terminal | near-black (not pure `#000`) | phosphor white | same red; optional single green readout | dense monospace, generous letter-spacing |

Commit to one for the whole page. Switching substrates mid-page is the one thing this preset
cannot do.

## Hard rules (invert the usual defaults)

- **Zero `border-radius` anywhere.** This is the one preset where the corner instinct from the
  base skill's own defaults should be turned off — 90-degree corners only.
- Extreme scale contrast: headers at a fluid `clamp()` reaching double-digit `rem`, tight negative
  tracking; metadata at 10–14px, wide positive tracking. No sizes in between.
- Grid lines come from `gap` plus contrasting background colors between cells, not from `border`
  declarations.
- ASCII/bracket decoration (`[ LIKE THIS ]`, `///`, crosshairs at grid intersections) is allowed
  as structural decoration, not as content filler — use it to mark real boundaries, not to look busy.

## Scope

This preset overrides the base skill's default rounded-corner and soft-shadow instincts on
purpose — that inversion is the whole preset, not a bug. Grid mechanics, responsive collapse, and
accessibility (contrast on the red accent, focus states on zero-radius controls) are still the
base skill's and ordinary review's job, not repeated here.
