import type { Chapter } from '../types';

/**
 * The public publication source.
 *
 * Keep this collection limited to material that is deliberately published for
 * readers. Future chapters can be added here without changing the library,
 * route, or navigation components.
 */
export const chapters: Chapter[] = [];

export function getPublishedChapters(): Chapter[] {
  return chapters
    .filter((chapter) => chapter.status === 'published')
    .sort((a, b) => a.number - b.number);
}

export function getChapterBySlug(slug: string): Chapter | undefined {
  return getPublishedChapters().find((chapter) => chapter.slug === slug);
}

export function getAdjacentChapters(slug: string): {
  previous?: Chapter;
  next?: Chapter;
} {
  const published = getPublishedChapters();
  const index = published.findIndex((chapter) => chapter.slug === slug);

  if (index === -1) {
    return {};
  }

  return {
    previous: published[index - 1],
    next: published[index + 1],
  };
}
