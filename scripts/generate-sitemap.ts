import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chapterPath, discussionPath, publicUrl } from '../src/lib/publicUrls.js';

// Load the reader's actual chapter module through Vite so its ?raw Markdown imports
// resolve exactly as they do in the app. A catalog entry without prose is not a URL.
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
  appType: 'custom',
  logLevel: 'error',
});
let slugs: string[];
try {
  const { getPublishedChapters } = await server.ssrLoadModule('/src/content/chapters.ts') as
    typeof import('../src/content/chapters.js');
  slugs = getPublishedChapters().map((chapter) => chapter.slug);
} finally {
  await server.close();
}

const paths = ['/', '/discussions', ...slugs.flatMap((slug) => [chapterPath(slug), discussionPath(slug)])];
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...paths.map((path) => `  <url><loc>${publicUrl(path).replaceAll('&', '&amp;')}</loc></url>`),
  '</urlset>',
  '',
].join('\n');
await writeFile(new URL('../public/sitemap.xml', import.meta.url), xml);
