import adapter from '@sveltejs/adapter-static'

// Fully prerendered: the page is one document and the content belongs in the HTML, not behind a
// hydration pass. Vercel serves build/ as plain static files.
export default {
  kit: {
    adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, precompress: false }),
    prerender: { entries: ['*'] },
  },
}
