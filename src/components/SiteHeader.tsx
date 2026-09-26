import { Link } from './Link';
import { Icon } from './Icon';
import { ReadingSettings } from './ReadingSettings';
import type { ReadingPreferences } from '../hooks/useReadingPreferences';
import { publication } from '../content/publication';

type SiteHeaderProps = {
  pathname: string;
  preferences: ReadingPreferences;
  onThemeToggle: () => void;
  onPreferencesChange: (update: Partial<ReadingPreferences>) => void;
};

export function SiteHeader({ pathname, preferences, onThemeToggle, onPreferencesChange }: SiteHeaderProps) {
  const isChapter = pathname.startsWith('/chapter/');

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="wordmark" href="/" aria-label={`${publication.title} library`}>
          <span className="wordmark-dusk">Dusk</span>
          <span className="wordmark-divider" aria-hidden="true">/</span>
          <span>Shingle</span>
        </Link>
        <nav className="primary-nav" aria-label="Primary navigation">
          <Link href="/" aria-current={pathname === '/' || pathname === '/library' ? 'page' : undefined}>
            Library
          </Link>
          {isChapter && <span className="nav-context" aria-current="page">Reading</span>}
        </nav>
        <div className="header-actions">
          {isChapter && <ReadingSettings preferences={preferences} updatePreferences={onPreferencesChange} />}
          <button className="theme-button" type="button" onClick={onThemeToggle} aria-label={`Switch to ${preferences.theme === 'paper' ? 'night' : 'paper'} theme`}>
            <Icon name={preferences.theme === 'paper' ? 'moon' : 'sun'} />
            <span className="theme-button-label">{preferences.theme === 'paper' ? 'Night' : 'Paper'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
