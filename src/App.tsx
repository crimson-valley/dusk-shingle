import { useEffect, useState } from 'react';
import { getAdjacentChapters, getChapterBySlug } from './content/chapters';
import { SiteHeader } from './components/SiteHeader';
import { ReaderProvider, useReader } from './lib/reader';
import { PUBLIC_ORIGIN, indexablePath, publicUrl } from './lib/publicUrls';
import { publication } from './content/publication';
import { matchRoute, type Route } from './lib/routes';
import { LibraryPage } from './pages/LibraryPage';
import { ChapterPage } from './pages/ChapterPage';
import { DiscussionPage } from './pages/DiscussionPage';
import { DiscussionsPage } from './pages/DiscussionsPage';
import { AccountPage } from './pages/AccountPage';
import { ModerationPage } from './pages/ModerationPage';
import { NotFoundPage } from './pages/NotFoundPage';

function currentPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export default function App() {
  return (
    <ReaderProvider>
      <Shell />
    </ReaderProvider>
  );
}

function Shell() {
  const [pathname, setPathname] = useState(currentPath);
  const { prefs } = useReader();
  const route = matchRoute(pathname);
  const chapter = 'slug' in route ? getChapterBySlug(route.slug) : undefined;
  const canonicalPath = indexablePath(route, chapter);

  useEffect(() => {
    const onPop = () => setPathname(currentPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Theme: resolve "auto" against the system, and keep it live.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = prefs.theme === 'auto' ? (mql.matches ? 'dusk' : 'paper') : prefs.theme;
      const root = document.documentElement;
      root.dataset.theme = resolved;
      root.dataset.size = prefs.fontSize;
      root.dataset.measure = prefs.measure;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dusk' ? '#121315' : '#f4f1ea');
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [prefs.theme, prefs.fontSize, prefs.measure]);

  useEffect(() => {
    const titles: Record<Route['name'], string> = {
      library: 'Dusk Shingle — Reader’s library',
      chapter: chapter ? `${chapter.title} — Dusk Shingle` : 'Chapter unavailable — Dusk Shingle',
      discussion: chapter ? `Discussion: ${chapter.title} — Dusk Shingle` : 'Discussion — Dusk Shingle',
      discussions: 'Discussions — Dusk Shingle',
      account: 'Account — Dusk Shingle',
      moderation: 'Moderation — Dusk Shingle',
      'not-found': 'Not found — Dusk Shingle',
    };
    document.title = titles[route.name];
  }, [route.name, chapter]);

  useEffect(() => {
    // Only published reader pages have canonical URLs. /library is a legacy alias
    // of /; unknown chapters, account management and moderation are not indexable.
    const isProduction = window.location.origin === PUBLIC_ORIGIN;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonicalPath) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.append(canonical);
      }
      canonical.href = publicUrl(canonicalPath);
    } else {
      canonical?.remove();
    }

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    robots.content = canonicalPath && isProduction ? 'index, follow' : 'noindex, nofollow';

    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) {
      description.content = route.name === 'chapter' && chapter
        ? `Read ${chapter.title}, chapter ${chapter.number} of Dusk Shingle.`
        : route.name === 'discussion' && chapter
          ? `Discuss ${chapter.title} with readers of Dusk Shingle.`
          : route.name === 'discussions'
            ? 'Chapter-by-chapter conversations about Dusk Shingle.'
            : publication.description;
    }
  }, [route.name, chapter, canonicalPath]);

  let page;
  switch (route.name) {
    case 'library': page = <LibraryPage />; break;
    case 'chapter': {
      const adjacent = getAdjacentChapters(route.slug);
      page = <ChapterPage chapter={chapter} previous={adjacent.previous} next={adjacent.next} />;
      break;
    }
    case 'discussion': page = <DiscussionPage chapter={chapter} />; break;
    case 'discussions': page = <DiscussionsPage />; break;
    case 'account': page = <AccountPage />; break;
    case 'moderation': page = <ModerationPage />; break;
    default: page = <NotFoundPage />;
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader pathname={pathname} readingTitle={route.name === 'chapter' ? chapter?.title : undefined} />
      {page}
    </div>
  );
}
