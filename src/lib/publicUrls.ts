import type { Chapter } from '../types';
import type { Route } from './routes';

/** Canonical public origin: the repository's production homepage (not a Vercel preview URL). */
export const PUBLIC_ORIGIN = 'https://dusk-shingle.vercel.app';

export function chapterPath(slug: string): string {
  return `/chapter/${encodeURIComponent(slug)}`;
}

export function discussionPath(slug: string): string {
  return `${chapterPath(slug)}/discussion`;
}

export function indexablePath(route: Route, chapter?: Chapter): string | undefined {
  if (route.name === 'library') return '/';
  if (route.name === 'discussions') return '/discussions';
  if (chapter && route.name === 'chapter') return chapterPath(chapter.slug);
  if (chapter && route.name === 'discussion') return discussionPath(chapter.slug);
  return undefined;
}

export function publicUrl(path: string): string {
  return new URL(path, PUBLIC_ORIGIN).href;
}
