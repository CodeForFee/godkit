# Frontend variant — verify-first

Same three dials and banned-defaults list as the base skill. The difference: this variant moves
the pre-flight check earlier and makes it mandatory output, and adds a forced-variety step so
repeat runs on the same brief don't land on the same layout. Use when prior output kept
converging on the same hero/grid shape across separate generations, or when a design needs a
written commitment before code for review purposes. Overkill for quick iteration on an
already-agreed design — use the base skill there instead.

## Forced variety

Before writing any code, pick one option from each row below and state the pick — derive the pick
from something stable about the brief (word count, section count, page name length) rather than
always taking the first option:

| Choice | Options |
|---|---|
| Hero layout | centered / offset-asymmetric / split |
| Type pairing | pick two, state them, never default to one font doing everything |
| Bento pattern | which `col-span`/`row-span` combination fills every cell |
| Motion approach | which one primitive carries the meaning this time |

## Mandatory pre-flight block

Write this out, filled in, before the first line of code — not as a check afterward:

1. Layout picks from the table above, with the one-line reason for each.
2. Headline line-count proof: state the container width and font-size clamp, confirm the headline
   resolves to 2–3 lines at that width, not 4+.
3. Grid density proof: state which cells exist, confirm none are empty (`grid-auto-flow: dense`
   or equivalent, verified by naming every occupied cell).
4. Label sweep: confirm no placeholder section labels ("Section 01", "Step 04", "About Us")
   remain — real headings only.

If any line in the block can't be filled in honestly, that's the signal to change the layout
before writing code, not to write the code and hope.

## Scope

The pre-flight block only proves the four items above — it is not an accessibility, correctness,
or performance check. The base skill's own pre-flight (checking against the banned-defaults
list) still applies on top of this one; use both.
