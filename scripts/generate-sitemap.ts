/**
 * Regenerates `public/sitemap.xml` from the canonical content source
 * (`src/content/`), so chapter URLs are never maintained by hand.
 *
 * Run automatically before every build (`npm run sitemap`); the output is
 * committed so dev and preview serve it without a build step. The sitemap test
 * (`src/lib/seo.test.ts`) fails if the committed file drifts from the source.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const outFile = fileURLToPath(new URL('../public/sitemap.xml', import.meta.url));

// Load the content source through Vite so the chapters module's `?raw` prose
// import resolves exactly as it does in the reader and tests.
const vite = await createServer({
  root,
  logLevel: 'error',
  appType: 'custom',
  // Nothing is served to a browser; skip dependency pre-bundling entirely.
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});
try {
  const seo = (await vite.ssrLoadModule('/src/lib/seo.ts')) as {
    renderSitemap: (entries: { loc: string; lastmod?: string }[]) => string;
    sitemapEntries: () => { loc: string; lastmod?: string }[];
  };
  writeFileSync(outFile, seo.renderSitemap(seo.sitemapEntries()), 'utf8');
  console.log(`Wrote public/sitemap.xml from the published content source.`);
} finally {
  await vite.close();
}
