# Frontend variant — redesigning an existing UI

Audit-first workflow for upgrading an EXISTING UI, not building a new one: scan the current
stack, run a fixed checklist against what's actually rendered, then fix in priority order without
a rewrite. Use when the user says "redesign this page", "audit this UI", "why does this look
AI-generated", "make this existing site feel premium", or points at a live screen and asks it to
look less generic. For a UI built from scratch, use the base skill directly. For checking whether
generated code is complete rather than stubbed, use **godkit-output-enforcement**.

Building new sets taste before the first line. Redesigning finds where taste already broke, in
code that has to keep working. Different failure mode, different process: audit, then fix — never
rewrite.

## Process

1. **Scan.** Read the codebase before touching it: framework, styling method (Tailwind, CSS
   modules, styled-components, vanilla), and the design tokens or theme file already in place.
   The fix has to live inside this stack.
2. **Set the dials.** Same three dials as the base skill (variance, motion, density) — infer
   them from what the product actually is, state the guess in one line.
3. **Diagnose.** Run the audit below against the live UI. List every hit — pattern, location,
   which category. This list is the plan; don't fix while diagnosing.
4. **Fix in priority order.** Work the list below top to bottom. Stop when the budget runs out —
   each rung ships independently, nothing later depends on it.

## The audit

Not exhaustive — categories to actually look at, with what "generic" looks like in each. A hit is
not automatically wrong; check it against the dials from step 2 before changing it.

| Category | Look for |
|---|---|
| **Typography** | Inter or the browser default everywhere; only weights 400/700; headlines with no presence; body copy wider than ~65ch; all-caps subheads |
| **Color / surface** | Pure `#000`/`#fff`; more than one accent; the purple-to-blue "AI gradient"; flat sections with zero depth; a lone dark section dropped into an otherwise light page |
| **Layout** | Everything centered and symmetric; three equal-width cards as the feature row; `100vh` instead of `100dvh`; no max-width container; misaligned baselines across side-by-side cards |
| **Interaction states** | No hover or active feedback; zero-duration transitions; missing focus ring; a spinner where a skeleton belongs; no empty or error state; buttons that link to `#` |
| **Content** | Lorem ipsum; "Acme Corp" / "John Doe"; fake round numbers (`99.99%`); AI copywriting tells ("Elevate", "Seamless", "Unleash"); identical dates or avatars across rows |
| **Components** | Card = border + shadow + white, applied everywhere elevation isn't the point; one filled button plus one ghost button as the only pairing; a 3-tower pricing table; a modal for something inline editing would do |
| **Iconography** | Lucide/Feather as the unexamined default; rocketship for "launch", shield for "security"; mixed stroke widths; missing favicon |
| **Code quality** | Div soup where `<nav>`/`<main>`/`<article>` belong; inline styles fighting the styling system; `z-index: 9999`; missing `alt` text; imports that don't exist in the manifest |
| **Omissions** | No 404 page; no back navigation; no client-side form validation; no skip-to-content link |

## Fix priority

Highest visual impact for lowest risk first. Each rung is independently shippable — stop anywhere
and the result is still coherent.

| # | Fix | Why first |
|---|---|---|
| 1 | Font swap | Biggest visible change, touches one token |
| 2 | Color palette cleanup | Removes clashing/oversaturated accents |
| 3 | Hover/active states | Makes the interface feel alive |
| 4 | Layout and spacing | Grid, max-width, consistent padding |
| 5 | Swap generic components | Cards, pricing tables, testimonial carousels |
| 6 | Loading/empty/error states | Makes it feel finished, not half-built |
| 7 | Typography scale polish | Diminishing returns, do it last |

## Rules

- **No framework or library migration.** Fix inside the stack found in step 1.
- **No new dependency** unless it's already in the manifest — same rung as godkit-lazy's "already
  installed" check.
- **Don't break functionality.** Verify after every change, not after the batch — see
  **godkit-execute**'s post-execute stage.
- **Small, reviewable diffs over a big rewrite.** If the fix wants a rewrite, that's a sign the
  seam is wrong — cut it smaller instead.
