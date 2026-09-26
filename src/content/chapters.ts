import type { Chapter, ChapterBlock } from '../types';
import chapterOneMarkdown from './chapters/chapter-001.md?raw';

/** Parse only the prose section after the source document's metadata divider. */
function parsePublishedProse(markdown: string): ChapterBlock[] {
  const prose = markdown.split(/^---\s*$/m).slice(1).join('\n---\n');
  return prose
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((text) => ({ type: 'paragraph', text }));
}

const title = chapterOneMarkdown.match(/^#\s+CHAPTER\s+001\s+—\s+(.+)$/m)?.[1]?.trim() ?? 'The Dry Pump';

/** Public publication source: only explicitly published reader-ready material belongs here. */
export const chapters: Chapter[] = [
  {
    slug: 'the-dry-pump',
    number: 1,
    title,
    publishedLabel: '26 September 2026',
    status: 'published',
    blocks: parsePublishedProse(chapterOneMarkdown),
  },
];

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
