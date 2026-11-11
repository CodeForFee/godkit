# Frontend variant — design-export spec

For AI screen-generation tools that render a static image or screen from a text spec, rather than
code you can iterate on directly. Produces a single-file design spec (template at
`references/stitch-DESIGN.md`) that encodes the dials, palette, type, components and motion
*intent* as prose+values the generator can follow in one pass, since there's no second pass to
fix a missed detail. Use when the user names a design-spec export, a screen-generation tool, or
asks for a "design system doc" / "DESIGN.md" to hand to one. For ordinary UI work in a codebase
you can iterate on, use the base skill directly.

A screen generator gets one shot: it renders from the spec once, with no follow-up turn to notice
a missed constraint. Everything the base skill would normally check *after* writing code has to
be stated *in* the spec instead, precisely enough that the generator can't default around it.

## What's different from ordinary frontend work

| Ordinary UI work | This variant |
|---|---|
| Write code, look at the render, iterate | Write the spec once, generator renders once |
| Motion is implemented | Motion is *described* — a later coding step implements it |
| Dials guide judgment calls as you go | Dials are baked into the spec as explicit values |
| Vague constraint gets caught on review | Vague constraint ships as-is — the generator picks the default |

Two consequences: state every constraint as a concrete value (a hex code, not "a nice blue"; a
font name, not "something distinctive"), and split the spec into what renders now versus what a
coding agent implements later.

## Process

1. **Set the dials.** Same three as the base skill — variance, motion, density — from the
   brief. State the guess in one line each.
2. **Fill the template.** Copy `references/stitch-DESIGN.md`, replace every bracketed
   placeholder with a real value for this project. No placeholder ships unfilled — an unfilled
   bracket in the spec is read literally by the generator.
3. **Split render-now from implement-later.** Palette, type, layout, and component shape render in
   this pass. Motion and interaction states do not — the tool draws a static screen. Write motion
   as intent (trigger, effect, why) in its own section so the coding agent that builds the real
   thing afterward has it verbatim, not re-derived.
4. **Name the hero technique explicitly if density/variance call for it.** A signature move for
   this format: small images set inline within the headline text itself, at type height, as
   punctuation between words — not a background image, not a side-by-side split. Only worth
   specifying when the brief wants that much visual risk; state it or omit it, don't leave it
   implied.
5. **Carry the banned-defaults list into the spec verbatim** — the generator has no other pass to
   catch a purple gradient hero or three identical feature cards, so the ban has to be an
   explicit line in the document, not an assumption.

Turning the rendered screen into working, interactive code is ordinary frontend work again —
switch back to the base skill once code is being written by hand.
