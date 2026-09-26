import { Link } from './Link';
import { publication } from '../content/publication';

type PublicationFooterProps = {
  chapterMode?: boolean;
};

export function PublicationFooter({ chapterMode = false }: PublicationFooterProps) {
  return (
    <footer className={`publication-footer${chapterMode ? ' publication-footer-chapter' : ''}`}>
      <div className="footer-rule" />
      <div className="footer-grid">
        <Link className="footer-wordmark" href="/" aria-label={`${publication.title} library`}>
          <span>{publication.shortTitle}</span>
        </Link>
        <p>{publication.editionLabel}<br />{publication.statusLabel}</p>
        <p className="footer-right">A quiet place for the published text.</p>
      </div>
      <p className="footer-title-note">
        <em>{publication.title}</em> is the name of the project under which this novel
        belongs — the novel’s true name will be revealed in due time.
      </p>
    </footer>
  );
}
