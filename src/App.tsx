import { useEffect, useState } from 'react';
import { getAdjacentChapters, getChapterBySlug } from './content/chapters';
import { SiteHeader } from './components/SiteHeader';
import { ReaderProvider, useReader } from './lib/reader';
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

type Route =
  | { name: 'library' }
  | { name: 'chapter'; slug: string }
  | { name: 'discussion'; slug: string }
  | { name: 'discussions' }
  | { name: 'account' }
  | { name: 'moderation' }
  | { name: 'not-found' };

function decode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

function matchRoute(path: string): Route {
  if (path === '/' || path === '/library') return { name: 'library' };
  if (path === '/discussions') return { name: 'discussions' };
  if (path === '/account') return { name: 'account' };
  if (path === '/moderation') return { name: 'moderation' };
  let m = path.match(/^\/chapter\/([^/]+)\/discussion$/);
  if (m) return { name: 'discussion', slug: decode(m[1]) };
  m = path.match(/^\/chapter\/([^/]+)$/);
  if (m) return { name: 'chapter', slug: decode(m[1]) };
  return { name: 'not-found' };
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
