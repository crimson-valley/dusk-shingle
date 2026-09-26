/** Parse untrusted comment text into safe render segments. No HTML is ever produced or interpreted. */
export type Segment = { kind: 'text' | 'spoiler'; text: string };

export function parseCommentBody(body: string): Segment[][] {
  return body.split(/\n{2,}/).map((para) => {
    const out: Segment[] = [];
    const re = /\|\|([^|]+)\|\|/g;
    let last = 0;
    for (let m = re.exec(para); m; m = re.exec(para)) {
      if (m.index > last) out.push({ kind: 'text', text: para.slice(last, m.index) });
      out.push({ kind: 'spoiler', text: m[1] });
      last = m.index + m[0].length;
    }
    if (last < para.length) out.push({ kind: 'text', text: para.slice(last) });
    return out;
  });
}

/** Highest chapter number the reader has finished, given completion by slug. */
export function readThrough(completedSlugs: string[], numberOf: (slug: string) => number | undefined): number {
  return completedSlugs.reduce((max, slug) => Math.max(max, numberOf(slug) ?? 0), 0);
}

/** A comment is folded when it discusses chapters beyond what this reader has finished. */
export const isFolded = (revealsThrough: number, readerThrough: number, discussionChapter: number) =>
  revealsThrough > Math.max(readerThrough, discussionChapter);
