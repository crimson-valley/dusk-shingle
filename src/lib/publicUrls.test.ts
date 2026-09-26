import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getChapterBySlug, getPublishedChapters } from '../content/chapters';
import { matchRoute } from './routes';
import { PUBLIC_ORIGIN, chapterPath, discussionPath, indexablePath, publicUrl } from './publicUrls';

const sitemap = readFileSync(new URL('../../public/sitemap.xml', import.meta.url), 'utf8');
const robots = readFileSync(new URL('../../public/robots.txt', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
  redirects: { source: string; destination: string; permanent: boolean }[];
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

describe('public discovery', () => {
  it('lists exactly the canonical library, discussions and published chapter/room URLs', () => {
    const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
    const expected = [
      '/', '/discussions',
      ...getPublishedChapters().flatMap((chapter) => [chapterPath(chapter.slug), discussionPath(chapter.slug)]),
    ].map(publicUrl);
    expect(urls).toEqual(expected);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      const parsed = new URL(url);
      expect(parsed.origin).toBe(PUBLIC_ORIGIN);
      expect(parsed.search).toBe('');
      expect(parsed.hash).toBe('');
      const route = matchRoute(parsed.pathname);
      expect(['library', 'discussions', 'chapter', 'discussion']).toContain(route.name);
      const chapter = 'slug' in route ? getChapterBySlug(route.slug) : undefined;
      if ('slug' in route) expect(chapter?.status).toBe('published');
      expect(indexablePath(route, chapter)).toBe(parsed.pathname);
    }
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(urls.map((url) => new URL(url).pathname).join(' ')).not.toMatch(/\/account|\/moderation|\/api|\/library|draft|workshop|report/i);
    expect(urls.join(' ')).not.toMatch(/dusk1-|\?|token|secret/i);
  });

  it('canonicalizes the library alias and does not index private or missing pages', () => {
    expect(indexablePath(matchRoute('/library'))).toBe('/');
    for (const path of ['/account', '/moderation', '/not-a-page', '/chapter/unpublished', '/chapter/unpublished/discussion']) {
      expect(indexablePath(matchRoute(path))).toBeUndefined();
    }
  });

  it('allows public pages, bars existing private routes and points to the sitemap', () => {
    expect(robots).toContain(`Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml`);
    expect(robots).toContain('Allow: /');
    for (const route of ['/account', '/moderation', '/api']) {
      expect(robots).toContain(`Disallow: ${route}`);
    }
    expect(robots).not.toMatch(/dusk1-|token|secret/i);
  });

  it('rewrites only actual SPA routes and leaves static assets to Vercel', () => {
    expect(vercel.rewrites.map((r) => r.source)).toEqual([
      '/api/:route(.*)', '/discussions', '/chapter/:slug/discussion', '/chapter/:slug', '/account', '/moderation',
    ]);
    expect(vercel.rewrites.filter((r) => r.destination === '/index.html')).toHaveLength(5);
    expect(vercel.redirects).toContainEqual({ source: '/library', destination: '/', permanent: true });
    for (const source of ['/account', '/moderation', '/api/(.*)']) {
      expect(vercel.headers.find((h) => h.source === source)?.headers).toContainEqual({
        key: 'X-Robots-Tag', value: 'noindex, nofollow',
      });
    }
  });
});
