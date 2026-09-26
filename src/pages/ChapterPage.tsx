import type { Chapter } from '../types';
import { ChapterBody } from '../components/ChapterBody';
import { ChapterNavigation } from '../components/ChapterNavigation';
import { Link } from '../components/Link';
import { Icon } from '../components/Icon';
import { PublicationFooter } from '../components/PublicationFooter';

function chapterNumber(number: number) {
  return String(number).padStart(2, '0');
}

type ChapterPageProps = {
  chapter?: Chapter;
  previous?: Chapter;
  next?: Chapter;
};

export function ChapterPage({ chapter, previous, next }: ChapterPageProps) {
  if (!chapter) {
    return <UnavailableChapter />;
  }

  return (
    <main id="main" className="chapter-page">
      <article className="reading-column" aria-labelledby="chapter-title">
        <header className="chapter-header">
          <Link className="back-to-library" href="/">
            <Icon name="arrow-left" />
            <span>Library</span>
          </Link>
          <div className="chapter-heading">
            <p className="chapter-kicker">Chapter {chapterNumber(chapter.number)}</p>
            <h1 id="chapter-title">{chapter.title}</h1>
            <div className="chapter-meta">
              {chapter.volume && <span>{chapter.volume}</span>}
              {chapter.publishedLabel && <span>{chapter.publishedLabel}</span>}
            </div>
          </div>
        </header>

        <ChapterBody blocks={chapter.blocks} />

        <section className="chapter-end" aria-label="End of chapter">
          <div className="chapter-end-mark" aria-hidden="true"><span /><span /><span /></div>
          <p className="chapter-end-label">End of chapter</p>
          <p className="chapter-end-note">You have reached the end of the published text.</p>
        </section>

        <ChapterNavigation previous={previous} next={next} />
      </article>
      <PublicationFooter chapterMode />
    </main>
  );
}

function UnavailableChapter() {
  return (
    <main id="main" className="chapter-page unavailable-page">
      <section className="unavailable-content" aria-labelledby="unavailable-title">
        <Link className="back-to-library" href="/"><Icon name="arrow-left" /> <span>Library</span></Link>
        <p className="chapter-kicker">Public edition</p>
        <h1 id="unavailable-title">This page is not here yet.</h1>
        <p className="unavailable-description">That chapter is not part of the published reader’s edition.</p>
        <Link className="quiet-button" href="/">Return to the library <Icon name="arrow-right" /></Link>
      </section>
      <PublicationFooter chapterMode />
    </main>
  );
}
