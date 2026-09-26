import { useEffect, useState } from 'react';
import { Link } from '../components/Link';
import { Notice } from '../components/Notice';
import { PublicationFooter } from '../components/PublicationFooter';
import { getPublishedChapters } from '../content/chapters';
import { api, ApiFailure } from '../lib/api';
import { useReader } from '../lib/reader';
import { chapterNumber, relativeTime } from '../lib/format';

type Summary = { slug: string; comments: number; latest: string | null };

export function DiscussionsPage() {
  const chapters = getPublishedChapters();
  const { vault } = useReader();
  const [summary, setSummary] = useState<Record<string, Summary>>();
  const [error, setError] = useState<ApiFailure>();

  useEffect(() => {
    api<{ chapters: Summary[] }>('GET', '/api/discussions')
      .then((d) => setSummary(Object.fromEntries(d.chapters.map((c) => [c.slug, c]))))
      .catch((e) => setError(e as ApiFailure));
  }, []);

  return (
    <>
      <main id="main" className="discussions page">
        <p className="meta-label">Discussions</p>
        <h1 className="standalone-title">One room per chapter.</h1>
        <p className="standalone-text">Each room discusses the story up to its chapter. Rooms for chapters you haven’t finished ask before opening.</p>
        {error && <Notice tone="quiet" title="Comment counts are unavailable">{error.message}</Notice>}
        <ol className="toc">
          {chapters.map((c) => {
            const s = summary?.[c.slug];
            const finished = vault.chapters[c.slug]?.completed;
            return (
              <li key={c.slug}>
                <Link className="toc-row" href={`/chapter/${c.slug}/discussion`}>
                  <span className="toc-num">{chapterNumber(c.number)}</span>
                  <span className="toc-title">{c.title}</span>
                  <span className="toc-meta">
                    {s ? (s.comments === 0 ? 'No comments yet' : `${s.comments} comment${s.comments === 1 ? '' : 's'} · ${relativeTime(s.latest!)}`) : ''}
                  </span>
                  <span className="toc-status">{finished ? 'Open' : 'Not yet read'}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </main>
      <PublicationFooter />
    </>
  );
}
