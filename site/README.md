# godkit.dev — the landing page

Vite + TypeScript, no framework. `index.html` is the whole page — the content is in the served
HTML, and `src/main.ts` only layers motion on top of a document that already reads with JS off.
A page selling a zero-dependency tool should not need a UI runtime.

Motion, by who does it:

- **Canvas**: the star field, and the code rain inside the protocol portal.
- **Motion** (Framer Motion's vanilla API, no React): things that arrive — hero copy, counters,
  reveals, chart lines, the reading-progress bar, button presses, the hero cards' changing content.
- **GSAP + ScrollTrigger**: scroll- and pointer-bound depth and the loops — the dashboard tipping up
  into place, cubes, hero parallax, 3D tilt, the circuit (wires measured from the real card and chip
  positions, one pulse per agent), feature cards scattering out of a pile, the orbit, the morphing
  chart, the typing terminal, the claim messages.
- **CSS**: rotating card borders (`@property --ang`), the marquee, shimmer, chip trace sparks, the
  CTA spotlight and its motes.

Elements are hidden only from JavaScript, never from CSS, and a safety timeout un-hides anything
still hidden, so a script error leaves a readable page. `prefers-reduced-motion` skips every loop
and draws the canvases once; pointer effects run only on a fine pointer. The JS bundle is about
80 KB gzipped, almost all of it GSAP and Motion.

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # tsc --noEmit, then -> build/, plain static files
pnpm preview
```

Not part of the npm package: `site/` is outside the `files` allowlist in the root `package.json`,
so nothing here is ever published to the registry.

## Deploying

Vercel, with **Root Directory set to `site`** — without that it builds the repo root, finds the
CLI package, and serves nothing. Framework preset **Other**: the build emits plain files into
`build/`, which `vercel.json` already declares. Everything else is in `vercel.json` too.
