import type { Chapter } from '../types';
import { Link } from './Link';
import { Icon } from './Icon';
import { chapterNumber } from '../lib/format';

export function ChapterNavigation({ previous, next }: { previous?: Chapter; next?: Chapter }) {
  return (
    <nav className="chapter-nav" aria-label="Chapters">
      <div className="chapter-nav-cell">
        {previous ? (
          <Link href={`/chapter/${previous.slug}`} rel="prev">
            <span className="meta"><Icon name="arrow-left" size={14} /> Chapter {chapterNumber(previous.number)}</span>
            <span className="chapter-nav-title">{previous.title}</span>
          </Link>
        ) : <span className="meta">The first chapter</span>}
      </div>
      <Link className="chapter-nav-contents" href="/">Contents</Link>
      <div className="chapter-nav-cell chapter-nav-next">
        {next ? (
          <Link href={`/chapter/${next.slug}`} rel="next">
            <span className="meta">Chapter {chapterNumber(next.number)} <Icon name="arrow-right" size={14} /></span>
            <span className="chapter-nav-title">{next.title}</span>
          </Link>
        ) : <span className="meta">Latest published</span>}
      </div>
    </nav>
  );
}
