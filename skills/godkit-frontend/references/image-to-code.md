# Frontend variant — image-to-code pipeline

Image-first pipeline for visually important frontend work: generate a reference image per
section, analyze it like a spec, then implement code that matches it closely. Use when building a
hero, landing page, marketing site, portfolio, or any UI where visual quality is the point and an
image-generation tool is available. Not for backend/API work, bug fixes, or a task where the user
already supplies a precise design system — go straight to code. For image-only deliverables with
no implementation step, use the `imagegen-web`/`imagegen-mobile` variants instead.

Order matters: generate the reference first, analyze it like a spec, implement last. Skipping
straight to code on a visual task is the failure mode this exists to prevent — a model's memory
of "good taste" is worse than an actual image in front of it.

## Pipeline

1. **Generate.** One image per section, not one board for the whole page. Compressing sections
   into a single image makes text, spacing, and buttons too small to read back out. Use the base
   skill's three dials to set the direction before generating — a fintech dashboard and a
   portfolio hero should not get the same image.
2. **Never crop for detail.** If a section needs a closer look, generate a fresh standalone image
   of just that section — same palette, type, and component family, larger and cleaner. A crop
   from a wide composite distorts the spacing and proportions you're trying to extract.
3. **Analyze like a spec, not a vibe.** For every generated image, extract concretely:

   | Extract | Look for |
   |---|---|
   | Text | Exact headline/CTA/label wording, where readable |
   | Typography | Size and weight relationships, line count, tracking |
   | Spacing | Section gaps, card padding, text-to-button distance |
   | Components | Button shape/radius/fill, card structure, dividers |
   | Color | Background, accent, text hierarchy, border logic |
   | Layout | Grid, alignment, section ordering, density |

   If any of these is unclear from the image, that is a signal to generate a closer detail image
   — not to guess.
4. **Implement to match, not to improve.** The code is the translation layer, not a redesign.
   Preserve section ordering, spacing rhythm, and typography mood exactly as analyzed. "Improving"
   a distinctive design into a generic coded layout during implementation is the most common way
   this pipeline fails — the images looked strong, the code shipped flat.
5. **Resolve ambiguity in order:** preserve visible design language → preserve layout/spacing →
   preserve component family → generate one more detail image → only then pick the most faithful
   reading. Don't fill gaps with generic defaults before trying another image.

## Section count

Don't default to one section per request. If the user asks for an 8-section landing page,
generate 8 images, not one compressed sheet — read the count off the ask, not off convenience.

## Extra banned defaults

Same list as the base skill, plus two implementation-specific ones this pipeline tends to
reintroduce even when the reference avoided them:

- cards-inside-cards-inside-cards, or a giant rounded wrapper around every section
- a hero crowded with pills, fake stats, and micro-labels that weren't in the reference

## Scope

Owns the generate-analyze-implement loop end to end. If the images already exist and only a spec
is wanted (no code), or the deliverable is the images themselves, use the `imagegen-web` /
`imagegen-mobile` variants instead and stop before implementation.
