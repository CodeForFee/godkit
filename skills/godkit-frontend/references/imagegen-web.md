# Frontend variant — web comps, image only

Generates website design reference images only — no code. One horizontal image per section,
art-directed to avoid the default left-text/right-image hero and purple-gradient AI look. Use
when the user wants a landing page, marketing site, or product page rendered as visual comps or a
moodboard, without implementation. Once code is wanted, hand the images to the `image-to-code`
variant. For mobile screens, use `imagegen-mobile`; for a full brand identity system, use
`godkit-brandkit`.

Output is images, full stop. Deliverable structure: one horizontal image per section, consistent
palette and type across the set, art direction that isn't the AI default. Set direction with the
base skill's three dials before generating — this is that taste system applied to comps instead
of CSS.

## Section count

Never compress the page into one tall image. One section, one call.

| Ask | Default section count |
|---|---|
| "hero" | 1 |
| "landing page" (no count given) | 6 |
| "full website" / "marketing site" | 8 |
| unspecified count, product/portfolio page | 6 |

If only one image per call is possible, generate sequentially in the same response, announcing
each ("Section 2 of 8: Trust bar") until the full set exists. Don't stop early and call it done.

## Before generating: pick a direction, commit

Choose one from each row below and hold it across every section image in the set — drifting
mid-set is how a "brand" becomes eight unrelated pictures:

| Axis | Pick one |
|---|---|
| Theme | light / dark / bold solid color / quiet neutral |
| Background per section | solid, texture, full-bleed image + overlay, editorial split, gradient — vary across sections, never all one mode |
| Typography mood | clean grotesk, expressive display, editorial serif+sans, Swiss |
| Hero scale | giant statement, mid editorial, or mini minimalist — pick decisively |
| Composition anchor per section | centered, off-grid, stacked, image-as-canvas — vary it, but the same anchor 3+ sections running reads as a template |

## Hero composition bias

Left-text/right-image is the most overused pattern in generated web comps. It's allowed, but earn
it — before drafting it, ask whether centered-over-image, bottom-left-over-image, or
stacked-center fits the brief better. Default to the alternative unless the classic is genuinely
the strongest read.

## Consistency across the set

Every section image in one job shares: palette, type scale, CTA family (style can vary, identity
can't), border-radius logic, image color grade. A viewer scrolling all the frames in sequence
should read one site, not a gallery of unrelated concepts.

## Extra banned defaults

Everything on the base skill's list, plus what's specific to comp generation:

- rainbow/mesh gradients, purple-to-blue "AI" gradient as a background default
- three identical stat columns, fake KPI dashboards with no product reason
- logo marquee strips, "trusted by" rows of unreadable mosquito logos
- generic filler copy ("unleash", "elevate", "seamless", "next-gen")
