# Design spec: [project name]

Fill every bracket with a real value before handing this to the generator. An unfilled bracket
renders literally.

## Dials

| Dial | Value (1-10) | One-line reason |
|---|---|---|
| DESIGN_VARIANCE | [ ] | [ ] |
| MOTION_INTENSITY | [ ] | [ ] |
| VISUAL_DENSITY | [ ] | [ ] |

## Atmosphere

[Two or three sentences: what this is, who looks at it, once or daily, what mood the surfaces
should carry. Concrete, not evocative filler.]

## Palette

| Role | Name | Hex |
|---|---|---|
| Background | [ ] | [ ] |
| Surface | [ ] | [ ] |
| Text primary | [ ] | [ ] |
| Text secondary | [ ] | [ ] |
| Border | [ ] | [ ] |
| Accent (max one) | [ ] | [ ] |

Constraints: one accent only. Saturation under 80%. No pure `#000`/`#fff` — use an off-black/
off-white. No unexamined purple-to-blue gradient.

## Type

| Role | Font | Notes |
|---|---|---|
| Display | [ ] | not Inter, not the browser default |
| Body | [ ] | max ~65ch line length |
| Mono (if data-heavy) | [ ] | numbers only, when density ≥ 7 |

## Layout

- Grid system: [CSS Grid columns / breakpoints]
- Max-width container: [value]
- Feature-row shape: [not three equal cards — name the actual shape: zig-zag, bento, scroll]
- Full-height sections: `min-height: 100dvh`, never `100vh`

## Components

| Component | Shape and states |
|---|---|
| Buttons | [fill/ghost, hover, active/pressed] |
| Cards | [when used — only where elevation communicates hierarchy] |
| Inputs | [label position, error placement] |
| Loading | [skeleton shape, not a generic spinner] |
| Empty state | [what it shows instead of "no data"] |
| Error state | [inline message copy style] |

## Hero (if variance/density call for visual risk)

- Structure: [split-screen / left-aligned / asymmetric whitespace — not centered, if variance ≥ 5]
- Inline-image-in-headline: [used / not used — describe placement if used]
- CTA count: one primary, no secondary link

## Motion — intent only, implemented later

This tool renders a static screen. Everything below is handed to whoever writes the real
interactive code next, verbatim — it is not implemented in this pass.

| Element | Trigger | Effect | Why |
|---|---|---|---|
| [ ] | [ ] | [ ] | [ ] |

Ground rules for whoever implements it: animate `transform`/`opacity` only, never `top`/`left`/
`width`/`height`. Spring or eased motion, not linear. Stagger list entries — nothing mounts all at
once.

## Banned defaults

Carried from the base skill — restate here, the generator has no later pass to catch these:

- purple-to-pink gradient hero background
- centered headline over a mesh-gradient or blob background
- exactly three feature cards, equal width, identical structure
- Inter (or system-ui) + `slate-900` as the unexamined font/color pair
- generic hero-features-CTA-footer SaaS template shape
