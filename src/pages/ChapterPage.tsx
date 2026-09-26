import { useEffect, useRef, useState } from 'react';
import type { Chapter } from '../types';
import { ChapterBody } from '../components/ChapterBody';
import { ChapterNavigation } from '../components/ChapterNavigation';
import { Link } from '../components/Link';
import { Icon } from '../components/Icon';
import { ProgressBar } from '../components/ProgressBar';
import { PublicationFooter } from '../components/PublicationFooter';
import { PrivateNote } from '../components/PrivateNote';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { useReader } from '../lib/reader';
import { chapterNumber, readingMinutes } from '../lib/format';
import { wordCount } from '../content/chapters';

type Props = { chapter?: Chapter; previous?: Chapter; next?: Chapter };

export function ChapterPage({ chapter, previous, next }: Props) {
  if (!chapter) return <UnavailableChapter />;
  return <ChapterReader key={chapter.slug} chapter={chapter} previous={previous} next={next} />;
}

function ChapterReader({ chapter, previous, next }: Required<Pick<Props, 'chapter'>> & Props) {
  const { vault, recordProgress } = useReader();
  const article = useRef<HTMLDivElement>(null);
  const progress = useReadingProgress(article, chapter.slug);
  const saved = useRef(vault.chapters[chapter.slug]);
  const [resumeOffer, setResumeOffer] = useState(() => {
    const s = saved.current;
    return s && !s.completed && s.progress > 0.03 ? s.progress : 0;
  });
  const lastWrite = useRef(0);
  const state = vault.chapters[chapter.slug];

  // Persist position at most every 1.5s, and always when the chapter is finished.
  useEffect(() => {
    const now = Date.now();
    if (progress < 0.01 && !saved.current) return;
    if (progress >= 0.97 || now - lastWrite.current > 1500) {
      lastWrite.current = now;
      recordProgress(chapter.slug, progress);
      if (resumeOffer && progress > 0.05) setResumeOffer(0);
    }
    // recordProgress identity changes with vault state; progress is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, chapter.slug]);

  function resume() {
    const el = article.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const target = top + resumeOffer * (el.offsetHeight - window.innerHeight * 0.35) - window.innerHeight * 0.65;
    window.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
    setResumeOffer(0);
  }

  const minutes = readingMinutes(wordCount(chapter));

  return (
    <>
      <ProgressBar value={progress} />
      <main id="main" className="chapter">
        <header className="prelude" aria-labelledby="chapter-title">
          <div className="prelude-inner">
            <p className="prelude-number">Chapter {chapterNumber(chapter.number)}</p>
            <h1 id="chapter-title" className="prelude-title">{chapter.title}</h1>
            <p className="prelude-meta">
              {chapter.volume && <span>{chapter.volume}</span>}
              {chapter.publishedLabel && <span>Published {chapter.publishedLabel}</span>}
              <span>About {minutes} min</span>
            </p>
          </div>
          <div className="prelude-horizon" aria-hidden="true" />
        </header>

        {resumeOffer > 0 && (
          <div className="resume">
            <button type="button" className="btn btn-quiet" onClick={resume}>
              Resume where you stopped · {Math.round(resumeOffer * 100)}%<Icon name="arrow-right" />
            </button>
            <button type="button" className="icon-btn" onClick={() => setResumeOffer(0)}>
              <Icon name="close" /><span className="visually-hidden">Start from the beginning</span>
            </button>
          </div>
        )}

        <div className="prose-wrap" ref={article}>
          <ChapterBody blocks={chapter.blocks} />
        </div>

        <section className="chapter-end" aria-labelledby="chapter-end-title">
          <div className="end-mark" aria-hidden="true" />
          <h2 id="chapter-end-title" className="meta-label">End of chapter {chapterNumber(chapter.number)}</h2>
          <p className="chapter-end-status" aria-live="polite">
            {state?.completed ? 'Marked as read.' : `${Math.round(progress * 100)}% read`}
          </p>
          <div className="chapter-end-actions">
            {next ? (
              <Link className="btn btn-primary" href={`/chapter/${next.slug}`}>Chapter {chapterNumber(next.number)} · {next.title}<Icon name="arrow-right" /></Link>
            ) : (
              <p className="meta">This is the latest published chapter.</p>
            )}
            <Link className="btn btn-secondary" href={`/chapter/${chapter.slug}/discussion`}>Discuss this chapter</Link>
          </div>
          <PrivateNote slug={chapter.slug} />
        </section>

        <ChapterNavigation previous={previous} next={next} />
      </main>
      <PublicationFooter />
    </>
  );
}

function UnavailableChapter() {
  return (
    <main id="main" className="standalone page">
      <p className="meta-label">Not in the edition</p>
      <h1 className="standalone-title">This chapter isn’t here.</h1>
      <p className="standalone-text">It may not be published yet, or the address may be mistyped. Nothing on this site links to unpublished chapters.</p>
      <Link className="btn btn-secondary" href="/"><Icon name="arrow-left" />Return to the library</Link>
    </main>
  );
}
