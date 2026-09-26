import { describe, expect, it } from 'vitest';
import { getAdjacentChapters, getChapterBySlug, getPublishedChapters } from './chapters';

describe('public chapter source', () => {
  it('publishes Chapter 1 from the authoritative Markdown while excluding its internal navigation metadata', () => {
    const chapter = getChapterBySlug('the-dry-pump');
    expect(chapter).toMatchObject({ number: 1, title: 'THE DRY PUMP', status: 'published' });
    expect(chapter?.blocks[0]).toEqual({ type: 'paragraph', text: 'At 04:17, Pump Seven stopped.' });
    expect(chapter?.blocks.at(-1)).toEqual({
      type: 'paragraph',
      text: 'For the first time that morning, he trusted the ugly numbers.',
    });
    expect(chapter?.blocks.map((block) => JSON.stringify(block)).join(' ')).not.toContain('app.notion.com');
    expect(chapter?.blocks).toHaveLength(209);
  });
  it('does not expose unpublished material', () => {
    expect(getPublishedChapters().every((chapter) => chapter.status === 'published')).toBe(true);
  });

  it('returns no chapter for an unknown public slug', () => {
    expect(getChapterBySlug('not-a-real-chapter')).toBeUndefined();
  });

  it('returns an empty navigation result for an unknown slug', () => {
    expect(getAdjacentChapters('not-a-real-chapter')).toEqual({});
  });
});
