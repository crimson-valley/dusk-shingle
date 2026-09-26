import { describe, expect, it } from 'vitest';
import { getAdjacentChapters, getChapterBySlug, getPublishedChapters } from './chapters';

// The initial repository contains no published prose. These assertions keep
// the public boundary explicit while the publication source is extended.
describe('public chapter source', () => {
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
