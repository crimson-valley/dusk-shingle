import type { Chapter } from '../types';
import { Link } from './Link';
import { Icon } from './Icon';

type ChapterNavigationProps = {
  previous?: Chapter;
  next?: Chapter;
};

export function ChapterNavigation({ previous, next }: ChapterNavigationProps) {
  return (
    <nav className="chapter-navigation" aria-label="Chapter navigation">
      <div className="chapter-nav-side chapter-nav-previous">
        {previous ? (
          <Link className="chapter-nav-link" href={`/chapter/${previous.slug}`}>
            <span className="chapter-nav-direction"><Icon name="arrow-left" /> Previous</span>
            <span className="chapter-nav-title">{previous.title}</span>
          </Link>
        ) : (
          <span className="chapter-nav-muted">Beginning of the edition</span>
        )}
      </div>
      <Link className="chapter-nav-library" href="/" aria-label="Return to library">
        <span className="library-mark" aria-hidden="true"><i /><i /><i /></span>
        <span>Library</span>
      </Link>
      <div className="chapter-nav-side chapter-nav-next">
        {next ? (
          <Link className="chapter-nav-link" href={`/chapter/${next.slug}`}>
            <span className="chapter-nav-direction">Next <Icon name="arrow-right" /></span>
            <span className="chapter-nav-title">{next.title}</span>
          </Link>
        ) : (
          <span className="chapter-nav-muted">Latest published page</span>
        )}
      </div>
    </nav>
  );
}
