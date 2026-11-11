# Frontend variant — mobile screens, image only

Generates mobile app screen and flow reference images only — no code, no SwiftUI/React
Native/Flutter output. Screens presented in a clean phone mockup by default, platform-aware
(iOS/Android/cross-platform), with a logical multi-screen flow rather than one hero screen. Use
when the user wants app screens, onboarding, or a flow rendered as visual comps. For websites or
landing pages, use `imagegen-web`. There is no implementation step from here.

Output is images of app screens, never code. What separates this from the web variant: platform
mode first, a phone mockup by default, safe-area awareness, and a screen *flow* that has to make
narrative sense, not just look consistent. Set direction with the base skill's three dials
first, same as web.

## Platform mode — decide before anything else

Pick one and hold it for the whole set: iOS-native (safe-area restraint, tab-bar calm), Android-
native (firmer component rhythm, explicit app-bar/bottom-nav), or cross-platform neutral (fewer
platform-specific ornaments). Mixing iOS and Android idioms in one flow is the single fastest way
to make a screen set look unconvincing.

## Screen count and flow logic

Don't collapse a requested flow into one hero screen. If the user asks for onboarding, generate
multiple distinct onboarding screens, not one screen with icon/headline swapped three times. Each
screen in a set must follow from the last — home → browse → detail, cart → checkout →
confirmation — not a loose collection that happens to share a palette. Before finalizing, ask: why
does screen 2 come after screen 1, what action gets the user there.

## Design bible — lock before generating screen 2

Same as the web variant's consistency rule, but mobile needs more anchors because the phone frame
adds constraints text/web comps don't have:

| Locked across the set | Free to vary per screen |
|---|---|
| Palette, type scale, device frame style + scale, corner radius, icon style, nav model | Composition, image-to-text balance, content density, CTA placement |

## Mockup framing

Phone mockup on by default, visible border, even margins on all sides, consistent scale across
the set. Content stays the hero — the frame supports it, never dominates it. Drop the visible
frame only when the user explicitly asks for raw screens or UI sheets.

## Non-negotiables specific to mobile

- **Safe areas.** Design around the status bar, home indicator, and nav regions — a screen that
  ignores them reads as a poster, not an app.
- **Text size.** If text looks small in the render, the screen isn't finished — simplify the
  layout or split content across another screen rather than shrinking type to fit.
- **Not a website in a phone frame.** Full-bleed hero blocks and desktop-density card grids are
  the tell. Mobile hierarchy is vertical and single-column-first.

## Extra banned defaults

The base list, plus mobile-specific tells: fake fintech charts with no product reason, generic
Lucide-style icon packs used as-is, three-slide onboarding that only changes an icon and a
headline, device frames touching the canvas edge or inconsistent bezels across a set.
