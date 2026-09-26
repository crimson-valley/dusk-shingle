export type Route =
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

export function matchRoute(path: string): Route {
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
