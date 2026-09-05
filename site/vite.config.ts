import { defineConfig } from 'vite'

// build/ rather than dist/: vercel.json already points there.
export default defineConfig({ build: { outDir: 'build' } })
