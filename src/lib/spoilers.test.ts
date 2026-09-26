import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isFolded, parseCommentBody, readThrough } from './spoilers';
import { CommentText } from '../components/CommentText';

describe('comment rendering', () => {
  it('splits paragraphs and ||spoiler|| spans', () => {
    expect(parseCommentBody('a ||b|| c\n\nd')).toEqual([
      [{ kind: 'text', text: 'a ' }, { kind: 'spoiler', text: 'b' }, { kind: 'text', text: ' c' }],
      [{ kind: 'text', text: 'd' }],
    ]);
  });
  it('escapes hostile markup instead of rendering it (XSS)', () => {
    const html = renderToString(createElement(CommentText, { body: '<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) ||<b>s</b>||' }));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).not.toMatch(/href=/);
    expect(html).toContain('&lt;script&gt;');
  });
  it('conceals spoiler spans until revealed', () => {
    const html = renderToString(createElement(CommentText, { body: 'He ||sent the logs||.' }));
    expect(html).toContain('aria-label="Hidden spoiler. Activate to reveal."');
    expect(html).not.toMatch(/aria-hidden="false"[^>]*>sent the logs/);
  });
});

describe('spoiler boundaries', () => {
  const numbers: Record<string, number> = { one: 1, two: 2, three: 3 };
  it('folds comments that reach beyond what the reader has finished', () => {
    const through = readThrough(['one'], (s) => numbers[s]);
    expect(through).toBe(1);
    expect(isFolded(1, through, 1)).toBe(false);
    expect(isFolded(3, through, 1)).toBe(true);
    expect(isFolded(3, readThrough(['one', 'two', 'three'], (s) => numbers[s]), 1)).toBe(false);
    // A comment scoped to the discussion's own chapter is gated by the chapter gate, not folded.
    expect(isFolded(2, 0, 2)).toBe(false);
  });
});
