/**
 * Phase 7 production verification against the deployed site.
 *
 * Drives the real client contract: derives the authKey from a reader key with
 * the same HKDF the browser uses (src/lib/crypto.ts), keeps the session cookie,
 * and exercises accounts, discussions, routing and authorisation over HTTPS.
 * Prints one PASS/FAIL line per checklist item. Read-only apart from the
 * comments it creates.
 */
import { webcrypto } from 'node:crypto';

const BASE = process.argv[2] ?? 'https://dusk-shingle.vercel.app';
const ORIGIN = BASE;
const enc = new TextEncoder();
let cookie = '';
let pass = 0;
let fail = 0;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      'X-Dusk-Client': '1',
      Origin: ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(';');
    if (pair.endsWith('=')) cookie = '';
    else cookie = pair;
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  return { status: res.status, data, text, headers: res.headers, setCookie };
}

// ── client-side crypto, mirroring src/lib/crypto.ts ──────────────────────────
const b64url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function newReaderKey() {
  return `dusk1-${b64url(webcrypto.getRandomValues(new Uint8Array(32)))}`;
}

async function deriveAuthKey(readerKey) {
  const raw = Buffer.from(readerKey.slice('dusk1-'.length).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const key = await webcrypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits']);
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('dusk-shingle/hkdf-salt/v1'), info: enc.encode('dusk-shingle/auth/v1') },
    key,
    256,
  );
  return b64url(bits);
}

const CHAPTER = 'the-dry-pump';
const stamp = Date.now().toString(36);

console.log(`\n=== Phase 7 verification against ${BASE} ===\n`);

// ── Anonymous account ────────────────────────────────────────────────────────
const readerKey = newReaderKey();
const authKey = await deriveAuthKey(readerKey);

const created = await api('POST', '/api/account', { authKey });
check('create anonymous account', created.status === 201, `status=${created.status} handle=${created.data?.handle}`);

const cookieHeader = created.setCookie.find((c) => c.includes('dusk_session')) ?? '';
check(
  'session cookie is HttpOnly + Secure + SameSite=Strict + __Host-',
  /HttpOnly/i.test(cookieHeader) && /Secure/i.test(cookieHeader) && /SameSite=Strict/i.test(cookieHeader) && cookieHeader.includes('__Host-'),
  cookieHeader.replace(/=[^;]+/, '=<redacted>'),
);
check('account credential never appears in a response body', !created.text.includes(readerKey) && !created.text.includes(authKey));

const me1 = await api('GET', '/api/me');
check('session established', me1.data?.account?.handle === created.data?.handle, `handle=${me1.data?.account?.handle}`);

const me2 = await api('GET', '/api/me');
check('session persists across a refresh', me2.data?.account?.handle === created.data?.handle);

// return later / new device: sign in with the reader key only
cookie = '';
const signedOut = await api('GET', '/api/me');
check('signing out clears the session', signedOut.data?.account === null);

const signIn = await api('POST', '/api/session', { authKey: await deriveAuthKey(readerKey) });
check('return later: sign in with the reader key', signIn.status === 200 && signIn.data?.handle === created.data?.handle, `handle=${signIn.data?.handle}`);

const reauth = await api('GET', '/api/me');
check('returning account still works', reauth.data?.account?.handle === created.data?.handle);

const unknown = await api('POST', '/api/session', { authKey: await deriveAuthKey(newReaderKey()) });
check(
  'unknown reader key rejected identically (no account enumeration)',
  unknown.status === 401 && unknown.data?.error?.code === 'unknown_key',
);

// ── Site + chapter discussions ───────────────────────────────────────────────
const disc = await api('GET', '/api/discussions');
check('site-wide discussions load', disc.status === 200 && Array.isArray(disc.data?.chapters), `${disc.data?.chapters?.length} chapter room(s)`);

const comment = await api('POST', `/api/chapters/${CHAPTER}/comments`, { body: `Production verification comment ${stamp}.` });
check('create chapter comment', comment.status === 201, `id=${comment.data?.id}`);
const commentId = comment.data?.id;

const reply = await api('POST', `/api/chapters/${CHAPTER}/comments`, { body: `Production verification reply ${stamp}.`, parentId: commentId });
check('create reply', reply.status === 201, `id=${reply.data?.id}`);

const listed = await api('GET', `/api/chapters/${CHAPTER}/comments`);
const mine = (listed.data?.comments ?? []).filter((c) => c.author === created.data?.handle);
check('comment + reply persist and are returned', listed.status === 200 && mine.length === 2, `${mine.length} of my comments`);

const threaded = (listed.data?.comments ?? []).find((c) => c.id === reply.data?.id);
check('reply is threaded under its parent', threaded?.parentId === commentId);

const disc2 = await api('GET', '/api/discussions');
const room = disc2.data?.chapters?.find((c) => c.slug === CHAPTER);
check('discussion index reflects the new comments', (room?.comments ?? 0) >= 2, `count=${room?.comments}`);

check('public profile is pseudonym only (no credential, no identity)', mine.every((c) => c.author === created.data?.handle) && !listed.text.includes(authKey));

// ── Authorisation ────────────────────────────────────────────────────────────
const noSession = await fetch(`${BASE}/api/chapters/${CHAPTER}/comments`, {
  method: 'POST',
  headers: { 'X-Dusk-Client': '1', Origin: ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ body: 'should not be accepted' }),
});
check('unauthenticated write rejected', noSession.status === 401);

const noCsrf = await fetch(`${BASE}/api/account`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ authKey }),
});
check('write without the client header rejected (CSRF)', noCsrf.status === 403);

const crossOrigin = await fetch(`${BASE}/api/account`, {
  method: 'POST',
  headers: { 'X-Dusk-Client': '1', Origin: 'https://evil.example', 'Content-Type': 'application/json' },
  body: JSON.stringify({ authKey }),
});
check('write from a foreign origin rejected (CSRF)', crossOrigin.status === 403);

check('author may edit their own comment', (await api('PATCH', `/api/comments/${commentId}`, { body: `Production verification comment ${stamp} (edited).` })).status === 200);
const mod = await api('GET', '/api/moderation/reports');
check('moderation queue refused to a non-moderator', mod.status === 403, `status=${mod.status}`);
const vaultProbe = await api('GET', '/api/vault');
check('vault readable only for its own account', vaultProbe.status === 200 && 'vault' in vaultProbe.data);

// ── Routing ──────────────────────────────────────────────────────────────────
for (const path of ['/', '/discussions', '/account', `/chapter/${CHAPTER}`, `/chapter/${CHAPTER}/discussion`, '/moderation', '/no/such/page']) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  check(`deep link ${path} resolves after refresh`, res.status === 200, `status=${res.status}`);
}
for (const [path, expect] of [['/library', 308], ['/index.html', 308]]) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  check(`${path} redirects to /`, res.status === expect && res.headers.get('location') === '/', `status=${res.status} loc=${res.headers.get('location')}`);
}
const html = await (await fetch(`${BASE}/`)).text();
const js = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
const css = html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
check('static assets load', Boolean(js && css) && (await fetch(`${BASE}${js}`)).status === 200 && (await fetch(`${BASE}${css}`)).status === 200, `${js}`);
const assetCache = (await fetch(`${BASE}${js}`)).headers.get('cache-control') ?? '';
check('assets cached immutably', assetCache.includes('immutable'), assetCache);

// ── Security ─────────────────────────────────────────────────────────────────
const csp = (await fetch(`${BASE}/`)).headers.get('content-security-policy') ?? '';
check('CSP present with strict script-src', csp.includes("script-src 'self'") && csp.includes("object-src 'none'"));
check('noindex on account route', ((await fetch(`${BASE}/account`, { redirect: 'manual' })).headers.get('x-robots-tag') ?? '').includes('noindex'));

const bundle = await (await fetch(`${BASE}${js}`)).text();
const leaks = ['DATABASE_URL', 'POSTGRES_URL', 'PGPASSWORD', 'NEON_AUTH_BASE_URL', 'VITE_NEON_AUTH_URL', 'neon.tech', 'neonauth', 'postgres://', 'postgresql://', 'service_role', 'eyJhbGciOi'];
const found = leaks.filter((s) => bundle.includes(s));
check('no database credentials or hosts in the client bundle', found.length === 0, found.length ? `LEAKED: ${found.join(', ')}` : `${bundle.length} bytes scanned`);

// ── Cleanup: remove the verification comments ────────────────────────────────
for (const c of [reply.data?.id, commentId].filter(Boolean)) await api('DELETE', `/api/comments/${c}`);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
