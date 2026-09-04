# godkit.dev — the landing page

SvelteKit, `adapter-static`, fully prerendered. `csr = false` in `src/routes/+layout.js`, so the
built page ships **no client JavaScript at all** — the content is in the HTML and the one piece of
motion is CSS. That is the point: a page selling a zero-dependency tool should not need a runtime.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> build/, plain static files
npm run preview
```

Not part of the npm package: `site/` is outside the `files` allowlist in the root `package.json`,
so nothing here is ever published to the registry.

## Deploying

Vercel, with **Root Directory set to `site`**. Everything else is in `vercel.json`.
