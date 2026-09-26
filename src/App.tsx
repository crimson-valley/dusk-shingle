import { useEffect, useMemo, useState } from 'react';
import { getAdjacentChapters, getChapterBySlug } from './content/chapters';
import { SiteHeader } from './components/SiteHeader';
import { ProgressBar } from './components/ProgressBar';
import { useReadingPreferences } from './hooks/useReadingPreferences';
import { LibraryPage } from './pages/LibraryPage';
import { ChapterPage } from './pages/ChapterPage';
import { NotFoundPage } from './pages/NotFoundPage';

function currentPath() {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path || '/';
}

function getChapterSlug(pathname: string) {
  const match = pathname.match(/^\/chapter\/([^/]+)$/);
  if (!match) return undefined;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

export default function App() {
  const [pathname, setPathname] = useState(currentPath);
  const { preferences, updatePreferences, toggleTheme } = useReadingPreferences();
  const chapterSlug = getChapterSlug(pathname);
  const chapter = chapterSlug ? getChapterBySlug(chapterSlug) : undefined;
  const adjacent = chapterSlug ? getAdjacentChapters(chapterSlug) : {};
  const isChapterRoute = pathname.startsWith('/chapter/');

  useEffect(() => {
    function handlePopState() {
      setPathname(currentPath());
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    document.title = chapter
      ? `${chapter.title} — Dusk Shingle`
      : pathname === '/' || pathname === '/library'
        ? 'Dusk Shingle — Reader’s library'
        : 'Dusk Shingle — Reader’s edition';
  }, [chapter, pathname]);

  const page = useMemo(() => {
    if (pathname === '/' || pathname === '/library') {
      return <LibraryPage />;
    }

    if (isChapterRoute) {
      return <ChapterPage chapter={chapter} previous={adjacent.previous} next={adjacent.next} />;
    }

    return <NotFoundPage />;
  }, [adjacent.next, adjacent.previous, chapter, isChapterRoute, pathname]);

  return (
    <div
      className={`app-shell theme-${preferences.theme} font-size-${preferences.fontSize} reading-width-${preferences.width} line-spacing-${preferences.lineSpacing}`}
      data-theme={preferences.theme}
    >
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader
        pathname={pathname}
        preferences={preferences}
        onThemeToggle={toggleTheme}
        onPreferencesChange={updatePreferences}
      />
      <ProgressBar enabled={Boolean(chapter)} />
      {page}
    </div>
  );
}
