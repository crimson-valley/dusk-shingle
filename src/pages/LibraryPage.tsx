import { getPublishedChapters } from '../content/chapters';
import { publication } from '../content/publication';
import { Link } from '../components/Link';
import { Icon } from '../components/Icon';
import { PublicationFooter } from '../components/PublicationFooter';

function chapterNumber(number: number) {
  return String(number).padStart(2, '0');
}

export function LibraryPage() {
  const publishedChapters = getPublishedChapters();
  const latestChapter = publishedChapters[publishedChapters.length - 1];

  return (
    <main id="main" className="library-page">
      <section className="library-hero page-width" aria-labelledby="library-title">
        <div className="hero-rail">
          <span className="eyebrow">{publication.editionLabel}</span>
          <span className="hero-index">00 / 00</span>
        </div>
        <div className="hero-copy">
          <p className="hero-kicker">{publication.statusLabel}</p>
          <h1 id="library-title"><span>Dusk</span> Shingle</h1>
          <p className="hero-description">{publication.description}</p>
        </div>
        <div className="hero-aside">
          <p className="aside-label">A reader’s library</p>
          <p>When a first page is ready, this is where reading will begin.</p>
        </div>
      </section>

      <section className="publication-overview page-width" aria-label="Publication overview">
        <div className="overview-item">
          <span className="overview-label">Edition</span>
          <span className="overview-value">{publication.editionLabel}</span>
        </div>
        <div className="overview-item">
          <span className="overview-label">Published chapters</span>
          <span className="overview-value">{chapterNumber(publishedChapters.length)}</span>
        </div>
        <div className="overview-item">
          <span className="overview-label">Current page</span>
          <span className="overview-value">{latestChapter ? `Chapter ${chapterNumber(latestChapter.number)}` : 'Not yet set'}</span>
        </div>
      </section>

      <section className="library-shelf page-width" aria-labelledby="shelf-title">
        <div className="section-heading">
          <div>
            <span className="section-index">01</span>
            <h2 id="shelf-title">The library</h2>
          </div>
          {latestChapter && (
            <Link className="text-link" href={`/chapter/${latestChapter.slug}`}>
              Continue reading <Icon name="arrow-right" />
            </Link>
          )}
        </div>

        {publishedChapters.length > 0 ? (
          <div className="chapter-list">
            {publishedChapters.map((chapter) => (
              <Link className="chapter-row" href={`/chapter/${chapter.slug}`} key={chapter.slug}>
                <span className="chapter-row-number">{chapterNumber(chapter.number)}</span>
                <span className="chapter-row-main">
                  {chapter.volume && <span className="chapter-row-volume">{chapter.volume}</span>}
                  <span className="chapter-row-title">{chapter.title}</span>
                </span>
                <span className="chapter-row-meta">{chapter.publishedLabel ?? 'Published'}</span>
                <Icon name="arrow-right" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-shelf">
            <div className="empty-shelf-mark" aria-hidden="true">—</div>
            <div className="empty-shelf-copy">
              <h3>The public edition is quiet for now.</h3>
              <p>Published chapters will take their place here when they are ready to be read.</p>
            </div>
            <span className="empty-shelf-status">No chapters published</span>
          </div>
        )}
      </section>

      <section className="library-note page-width" aria-labelledby="note-title">
        <div className="note-mark" aria-hidden="true"><span /><span /><span /></div>
        <div>
          <span className="section-index">02</span>
          <h2 id="note-title">A place for the text.</h2>
          <p>There is nothing else to keep up with here. When a chapter arrives, this is where it will begin.</p>
        </div>
      </section>

      <PublicationFooter />
    </main>
  );
}
