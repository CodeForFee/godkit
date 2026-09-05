# godkit.dev — the landing page

Vite + TypeScript, no framework. `index.html` is the whole page — the content is in the served
HTML, and `src/main.ts` only layers the GSAP motion on top of a document that already reads with
JS off. That is the point: a page selling a zero-dependency tool should not need a UI runtime.

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
