/* eslint-disable @typescript-eslint/no-explicit-any -- test assertions over untyped JSON responses */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb } from './pglite.js';
import { handle } from './router.js';
import type { Db } from './db.js';
import type { ApiRequest } from './http.js';
import { deriveKeys, encryptJson, generateDataKey, generateReaderKey, unwrapDataKey, wrapDataKey, decryptJson } from '../src/lib/crypto.js';

let db: Db;
let ipCounter = 0;

beforeAll(() => {
  // Set the real key material the deployment uses. Without this the suite would
  // pass on a per-process fallback and never notice that the IP rate limits are
  // silently reset on every cold start.
  process.env.RATE_LIMIT_SECRET = 'test-only-rate-limit-secret-0123456789abcdef';
});

beforeEach(async () => {
  db = await createPgliteDb();
});

type Client = { cookie?: string; ip: string };
const newClient = (): Client => ({ ip: `10.0.0.${++ipCounter}` });

async function call(client: Client, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const req: ApiRequest = {
    method, path, body, ip: client.ip,
    headers: { host: 'reader.test', 'x-dusk-client': '1', cookie: client.cookie, ...extra },
  };
  const res = await handle(req, () => Promise.resolve(db));
  const set = res.cookies?.[0];
  if (set) client.cookie = set.split(';')[0].endsWith('=') ? undefined : set.split(';')[0];
  return res as { status: number; body: any; cookies?: string[] };
}

async function signUp(client = newClient()) {
  const readerKey = generateReaderKey();
  const { authKey } = await deriveKeys(readerKey);
  const res = await call(client, 'POST', '/api/account', { authKey });
  expect(res.status).toBe(201);
  return { client, readerKey, handle: res.body.handle as string };
}

describe('anonymous accounts', () => {
  it('creates an account from a client-derived auth key with no identity fields', async () => {
    const { client, handle } = await signUp();
    expect(handle).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d{3}$/);
    const me = await call(client, 'GET', '/api/me');
    expect(me.body.account).toEqual({ handle, role: 'reader' });
    const cols = await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'accounts'`);
    expect(cols.rows.map((c) => c.column_name).sort()).toEqual(['auth_hash', 'created_at', 'handle', 'id', 'replies_seen_at', 'role']);
  });

  it('never stores the reader key, the auth key, or the session secret in plaintext', async () => {
    const { client, readerKey } = await signUp();
    const { authKey } = await deriveKeys(readerKey);
    const dump = JSON.stringify((await db.query(`SELECT * FROM accounts`)).rows) + JSON.stringify((await db.query(`SELECT * FROM sessions`)).rows);
    const hex = (s: string) => Buffer.from(s).toString('hex');
    for (const secret of [readerKey, authKey, client.cookie!.split('=')[1]]) {
      expect(dump).not.toContain(secret);
      expect(dump).not.toContain(hex(secret));
    }
  });

  it('issues an HttpOnly, SameSite=Strict, Secure __Host- cookie over HTTPS', async () => {
    const { authKey } = await deriveKeys(generateReaderKey());
    const res = await call(newClient(), 'POST', '/api/account', { authKey }, { 'x-forwarded-proto': 'https' });
    const cookie = res.cookies![0];
    expect(cookie).toMatch(/^__Host-dusk_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+; Secure$/);
    expect(JSON.stringify(res.body)).not.toContain(cookie.split(';')[0].split('=')[1]);
  });

  it('enforces credential uniqueness at the database level', async () => {
    const { authKey } = await deriveKeys(generateReaderKey());
    expect((await call(newClient(), 'POST', '/api/account', { authKey })).status).toBe(201);
    const again = await call(newClient(), 'POST', '/api/account', { authKey });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('key_collision');
    await expect(db.query(`INSERT INTO accounts (id, auth_hash, handle) SELECT gen_random_uuid(), auth_hash, 'x' FROM accounts LIMIT 1`)).rejects.toThrow();
  });

  it('signs in on a second device with the reader key, and rejects unknown keys generically', async () => {
    const { readerKey, handle } = await signUp();
    const device2 = newClient();
    const res = await call(device2, 'POST', '/api/session', { authKey: (await deriveKeys(readerKey)).authKey });
    expect(res.status).toBe(200);
    expect(res.body.handle).toBe(handle);
    const bad = await call(newClient(), 'POST', '/api/session', { authKey: (await deriveKeys(generateReaderKey())).authKey });
    expect(bad.status).toBe(401);
    expect((await call(newClient(), 'POST', '/api/session', { authKey: 'nope' })).status).toBe(401);
  });

  it('signs out, and signing out everywhere revokes other devices', async () => {
    const { client, readerKey } = await signUp();
    const other = newClient();
    await call(other, 'POST', '/api/session', { authKey: (await deriveKeys(readerKey)).authKey });
    await call(client, 'DELETE', '/api/sessions');
    expect((await call(other, 'GET', '/api/me')).body.account).toBeNull();
  });

  it('rate-limits account creation per network bucket', async () => {
    const c = newClient();
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await call({ ip: c.ip }, 'POST', '/api/account', { authKey: (await deriveKeys(generateReaderKey())).authKey })).status);
    expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
    const buckets = JSON.stringify((await db.query(`SELECT bucket FROM rate_events`)).rows);
    expect(buckets).not.toContain(c.ip);
  });

  it('refuses IP rate limits when RATE_LIMIT_SECRET is missing instead of using unstable key material', async () => {
    const { authKey } = await deriveKeys(generateReaderKey());
    const saved = process.env.RATE_LIMIT_SECRET;
    delete process.env.RATE_LIMIT_SECRET;
    try {
      const res = await call(newClient(), 'POST', '/api/account', { authKey });
      // Fails closed: a silently-resetting limit is worse than a visible outage.
      expect(res.status).toBe(500);
      // Authenticated per-account limits do not use this secret, so the rest of
      // the product keeps working.
      const { client } = { client: newClient() };
      process.env.RATE_LIMIT_SECRET = saved;
      const signIn = await call(client, 'POST', '/api/session', { authKey });
      expect([401, 429]).toContain(signIn.status);
    } finally {
      process.env.RATE_LIMIT_SECRET = saved;
    }
  });

  it('logs why the database is unavailable without leaking credentials', async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      logged.push(String(line));
    });
    // Entirely synthetic, and on the reserved .invalid TLD (RFC 2606) so it can
    // never name a real host. The point is to prove a realistic driver message is
    // reduced to something safe before it reaches a log.
    const connectionFailure = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'XX000',
      message:
        'connect ECONNREFUSED: postgres://dusk:not-a-real-password@db.invalid:5432/app?sslmode=require ' +
        'password=not-a-real-password user=dusk',
    });
    try {
      const res = await handle(
        { method: 'GET', path: '/api/health', body: undefined, ip: '1', headers: { host: 'reader.test' } },
        () => Promise.reject(connectionFailure),
      );
      expect(res.status).toBe(503);
    } finally {
      spy.mockRestore();
    }
    const output = logged.join('\n');
    // Diagnosable: the driver code and the server's own wording must survive.
    expect(output).toContain('XX000');
    expect(output).toContain('ECONNREFUSED');
    // Not recoverable from the logs by anyone. The scheme is left as a marker;
    // everything after it must be gone.
    expect(output).not.toContain('not-a-real-password');
    expect(output).not.toContain('db.invalid');
    expect(output).not.toContain('user=dusk');
    expect(output).toContain('postgres://[redacted]');
  });

  it('blocks state-changing requests without the client header or from another origin (CSRF)', async () => {
    const { authKey } = await deriveKeys(generateReaderKey());
    const res1 = await handle({ method: 'POST', path: '/api/account', body: { authKey }, ip: '1', headers: { host: 'reader.test' } }, () => Promise.resolve(db));
    expect(res1.status).toBe(403);
    const res2 = await call(newClient(), 'POST', '/api/account', { authKey }, { origin: 'https://evil.example' });
    expect(res2.status).toBe(403);
  });

  it('degrades honestly when no database is configured', async () => {
    const res = await handle({ method: 'GET', path: '/api/me', body: undefined, ip: '1', headers: {} }, () => undefined);
    expect(res.status).toBe(503);
    expect((res.body as any).error.code).toBe('not_configured');
  });
});

describe('end-to-end encrypted vault', () => {
  it('stores only ciphertext and syncs across devices; the server cannot decrypt', async () => {
    const { client, readerKey } = await signUp();
    const { kek } = await deriveKeys(readerKey);
    const dek = await generateDataKey();
    const secretNote = 'the pump was never the problem';
    const put = await call(client, 'PUT', '/api/vault', {
      baseVersion: 0, wrappedKey: await wrapDataKey(dek, kek), ciphertext: await encryptJson(dek, { note: secretNote }),
    });
    expect(put.body.version).toBe(1);

    const stored = JSON.stringify((await db.query(`SELECT * FROM vaults`)).rows);
    expect(stored).not.toContain(secretNote);
    expect(stored).not.toContain('pump');

    // Device 2: only the reader key is transferred.
    const device2 = newClient();
    await call(device2, 'POST', '/api/session', { authKey: (await deriveKeys(readerKey)).authKey });
    const got = (await call(device2, 'GET', '/api/vault')).body.vault;
    const dek2 = await unwrapDataKey(got.wrappedKey, (await deriveKeys(readerKey)).kek);
    expect(await decryptJson(dek2, got.ciphertext)).toEqual({ note: secretNote });

    // Anything the server holds (auth hash, wrapped key) is insufficient: a different key fails.
    await expect(unwrapDataKey(got.wrappedKey, (await deriveKeys(generateReaderKey())).kek)).rejects.toThrow();
  });

  it('rejects stale writes with 409 and returns the current vault for merging', async () => {
    const { client, readerKey } = await signUp();
    const { kek } = await deriveKeys(readerKey);
    const dek = await generateDataKey();
    const wrappedKey = await wrapDataKey(dek, kek);
    await call(client, 'PUT', '/api/vault', { baseVersion: 0, wrappedKey, ciphertext: await encryptJson(dek, 1) });
    await call(client, 'PUT', '/api/vault', { baseVersion: 1, wrappedKey, ciphertext: await encryptJson(dek, 2) });
    const stale = await call(client, 'PUT', '/api/vault', { baseVersion: 1, wrappedKey, ciphertext: await encryptJson(dek, 3) });
    expect(stale.status).toBe(409);
    expect(stale.body.error.vault.version).toBe(2);
    expect(await decryptJson(dek, stale.body.error.vault.ciphertext)).toBe(2);
    const second = await call(client, 'PUT', '/api/vault', { baseVersion: 0, wrappedKey, ciphertext: await encryptJson(dek, 4) });
    expect(second.status).toBe(409);
  });

  it('validates vault payloads and isolates vaults between accounts', async () => {
    const a = await signUp();
    const b = await signUp();
    expect((await call(a.client, 'PUT', '/api/vault', { baseVersion: 0, wrappedKey: '<x>', ciphertext: 'y' })).status).toBe(400);
    expect((await call(a.client, 'PUT', '/api/vault', { baseVersion: 0, wrappedKey: 'abc', ciphertext: 'a'.repeat(95000) })).status).toBe(400);
    await call(a.client, 'PUT', '/api/vault', { baseVersion: 0, wrappedKey: 'abc', ciphertext: 'def' });
    expect((await call(b.client, 'GET', '/api/vault')).body.vault).toBeNull();
    expect((await call(newClient(), 'GET', '/api/vault')).status).toBe(401);
  });
});

describe('discussions', () => {
  const slug = 'the-dry-pump';
  const post = (c: Client, body: unknown) => call(c, 'POST', `/api/chapters/${slug}/comments`, body);

  it('creates comments and one-level replies under public pseudonyms only', async () => {
    const alice = await signUp();
    const bob = await signUp();
    const top = await post(alice.client, { body: 'The ugly numbers.' });
    expect(top.status).toBe(201);
    const reply = await post(bob.client, { body: 'Yes.', parentId: top.body.id });
    await post(alice.client, { body: 'Nested?', parentId: reply.body.id });
    const list = await call(newClient(), 'GET', `/api/chapters/${slug}/comments`);
    expect(list.body.comments).toHaveLength(3);
    expect(list.body.comments[2].parentId).toBe(top.body.id); // flattened to the thread root
    const text = JSON.stringify(list.body);
    expect(text).toContain(alice.handle);
    expect(text).not.toMatch(/account_?id|auth_?(hash|key)/i);
  });

  it('stores content verbatim as text for escaped rendering and strips control characters', async () => {
    const { client } = await signUp();
    await post(client, { body: '<img src=x onerror=alert(1)>\u202E\u0000 hi' });
    const c = (await call(client, 'GET', `/api/chapters/${slug}/comments`)).body.comments[0];
    expect(c.body).toBe('<img src=x onerror=alert(1)> hi');
  });

  it('validates input: empty, oversized, link spam, unknown chapter, bad parent, duplicates', async () => {
    const { client } = await signUp();
    expect((await post(client, { body: '   ' })).status).toBe(400);
    expect((await post(client, { body: 'x'.repeat(4001) })).status).toBe(400);
    expect((await post(client, { body: 'http://a http://b http://c' })).status).toBe(400);
    expect((await call(client, 'POST', '/api/chapters/not-real/comments', { body: 'hi' })).status).toBe(404);
    expect((await post(client, { body: 'hi', parentId: 'nope' })).status).toBe(400);
    expect((await post(client, { body: 'hi', parentId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
    expect((await post(client, { body: 'same' })).status).toBe(201);
    expect((await post(client, { body: 'same' })).status).toBe(409);
    expect((await post(newClient(), { body: 'anon' })).status).toBe(401);
  });

  it('enforces spoiler scope server-side: cannot claim unpublished or earlier chapters', async () => {
    const { client } = await signUp();
    expect((await post(client, { body: 'a', revealsThrough: 2 })).status).toBe(400);
    expect((await post(client, { body: 'b', revealsThrough: 0 })).status).toBe(400);
    expect((await post(client, { body: 'c', revealsThrough: '1' })).status).toBe(400);
    expect((await post(client, { body: 'Hidden ||he sent the logs|| part' })).status).toBe(201);
    const c = (await call(client, 'GET', `/api/chapters/${slug}/comments`)).body.comments[0];
    expect(c).toMatchObject({ hasSpoiler: true, revealsThrough: 1 });
  });

  it('only lets authors edit or delete their own comments', async () => {
    const alice = await signUp();
    const bob = await signUp();
    const { body } = await post(alice.client, { body: 'original' });
    expect((await call(bob.client, 'PATCH', `/api/comments/${body.id}`, { body: 'hijack' })).status).toBe(403);
    expect((await call(bob.client, 'DELETE', `/api/comments/${body.id}`)).status).toBe(403);
    expect((await call(alice.client, 'PATCH', `/api/comments/${body.id}`, { body: 'revised' })).status).toBe(200);
    const c = (await call(bob.client, 'GET', `/api/chapters/${slug}/comments`)).body.comments[0];
    expect(c.body).toBe('revised');
    expect(c.editedAt).toBeTruthy();
    expect(c.mine).toBe(false);
  });

  it('tombstones deleted comments with replies and removes them once the thread empties', async () => {
    const alice = await signUp();
    const bob = await signUp();
    const top = (await post(alice.client, { body: 'parent' })).body.id;
    const reply = (await post(bob.client, { body: 'child' })).body.id;
    const reply2 = (await post(bob.client, { body: 'child2', parentId: top })).body.id;
    expect(reply).toBeTruthy();
    await call(alice.client, 'DELETE', `/api/comments/${top}`);
    let list = (await call(bob.client, 'GET', `/api/chapters/${slug}/comments`)).body.comments;
    const tomb = list.find((c: any) => c.id === top);
    expect(tomb).toMatchObject({ status: 'deleted', body: '', author: null });
    await call(bob.client, 'DELETE', `/api/comments/${reply2}`);
    list = (await call(bob.client, 'GET', `/api/chapters/${slug}/comments`)).body.comments;
    expect(list.find((c: any) => c.id === top)).toBeUndefined();
  });

  it('allows one quiet reaction per reader, never on own comments', async () => {
    const alice = await signUp();
    const bob = await signUp();
    const id = (await post(alice.client, { body: 'x' })).body.id;
    expect((await call(alice.client, 'PUT', `/api/comments/${id}/reaction`)).status).toBe(400);
    await call(bob.client, 'PUT', `/api/comments/${id}/reaction`);
    await call(bob.client, 'PUT', `/api/comments/${id}/reaction`);
    let c = (await call(bob.client, 'GET', `/api/chapters/${slug}/comments`)).body.comments[0];
    expect(c).toMatchObject({ reactions: 1, reacted: true });
    await call(bob.client, 'DELETE', `/api/comments/${id}/reaction`);
    c = (await call(bob.client, 'GET', `/api/chapters/${slug}/comments`)).body.comments[0];
    expect(c.reactions).toBe(0);
  });

  it('rate-limits commenting', async () => {
    const { client } = await signUp();
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await post(client, { body: `note ${i}` })).status);
    expect(statuses).toEqual([201, 201, 429, 429]); // brand-new accounts: 2 per 10 minutes
  });

  it('notifies authors of replies and marks them seen', async () => {
    const alice = await signUp();
    const bob = await signUp();
    const id = (await post(alice.client, { body: 'x' })).body.id;
    await post(bob.client, { body: 'reply', parentId: id });
    let n = (await call(alice.client, 'GET', '/api/notifications')).body;
    expect(n.replies).toHaveLength(1);
    expect(n.replies[0]).toMatchObject({ author: bob.handle, unread: true });
    await call(alice.client, 'POST', '/api/notifications/seen');
    n = (await call(alice.client, 'GET', '/api/notifications')).body;
    expect(n.replies[0].unread).toBe(false);
  });
});

describe('moderation', () => {
  const slug = 'the-dry-pump';
  it('auto-hides after three independent reports, and only moderators can act', async () => {
    const author = await signUp();
    const id = (await call(author.client, 'POST', `/api/chapters/${slug}/comments`, { body: 'spam' })).body.id;
    expect((await call(author.client, 'POST', `/api/comments/${id}/report`, { reason: 'spam' })).status).toBe(400);
    const reporters = [await signUp(), await signUp(), await signUp()];
    expect((await call(reporters[0].client, 'POST', `/api/comments/${id}/report`, { reason: 'bogus' })).status).toBe(400);
    for (const r of reporters) expect((await call(r.client, 'POST', `/api/comments/${id}/report`, { reason: 'spam' })).status).toBe(200);
    const pub = (await call(newClient(), 'GET', `/api/chapters/${slug}/comments`)).body.comments[0];
    expect(pub).toMatchObject({ status: 'hidden', body: '' });
    const own = (await call(author.client, 'GET', `/api/chapters/${slug}/comments`)).body.comments[0];
    expect(own.body).toBe('spam');

    expect((await call(reporters[0].client, 'GET', '/api/moderation/reports')).status).toBe(403);
    expect((await call(reporters[0].client, 'POST', `/api/moderation/comments/${id}`, { state: 'visible' })).status).toBe(403);

    const mod = await signUp();
    await db.query(`UPDATE accounts SET role = 'moderator' WHERE handle = $1`, [mod.handle]);
    const queue = (await call(mod.client, 'GET', '/api/moderation/reports')).body.items;
    expect(queue[0]).toMatchObject({ id, reports: 3 });
    expect((await call(mod.client, 'POST', `/api/moderation/comments/${id}`, { state: 'removed' })).status).toBe(200);
    expect((await call(newClient(), 'GET', `/api/chapters/${slug}/comments`)).body.comments).toHaveLength(0);
    expect((await call(author.client, 'PATCH', `/api/comments/${id}`, { body: 'sneaky' })).status).toBe(403);
  });
});

describe('account deletion', () => {
  it('removes the account and all associated records, leaving only tombstones others replied to', async () => {
    const alice = await signUp();
    const bob = await signUp();
    const slug = 'the-dry-pump';
    await call(alice.client, 'PUT', '/api/vault', { baseVersion: 0, wrappedKey: 'abc', ciphertext: 'def' });
    const lonely = (await call(alice.client, 'POST', `/api/chapters/${slug}/comments`, { body: 'lonely' })).body.id;
    const replied = (await call(alice.client, 'POST', `/api/chapters/${slug}/comments`, { body: 'replied to' })).body.id;
    const bobTop = (await call(bob.client, 'POST', `/api/chapters/${slug}/comments`, { body: 'bob top' })).body.id;
    await call(bob.client, 'POST', `/api/chapters/${slug}/comments`, { body: 'bob reply', parentId: replied });
    await call(alice.client, 'PUT', `/api/comments/${bobTop}/reaction`);
    await call(alice.client, 'POST', `/api/comments/${bobTop}/report`, { reason: 'other' });

    expect((await call(alice.client, 'DELETE', '/api/account', { confirm: 'nope' })).status).toBe(400);
    const del = await call(alice.client, 'DELETE', '/api/account', { confirm: 'delete my account' });
    expect(del.status).toBe(200);
    expect(del.cookies![0]).toContain('Max-Age=0');

    for (const table of ['accounts', 'sessions', 'vaults', 'reactions', 'reports']) {
      const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} t ${table === 'accounts' ? `WHERE handle = $1` : table === 'sessions' || table === 'vaults' ? `WHERE account_id NOT IN (SELECT id FROM accounts)` : table === 'reactions' ? `WHERE account_id NOT IN (SELECT id FROM accounts)` : `WHERE reporter_id NOT IN (SELECT id FROM accounts)`}`, table === 'accounts' ? [alice.handle] : []);
      expect(rows[0].n, table).toBe(0);
    }
    const all = (await db.query<{ id: string; body: string; account_id: string | null }>(`SELECT id, body, account_id FROM comments`)).rows;
    expect(all.find((c) => c.id === lonely)).toBeUndefined();
    expect(all.find((c) => c.id === replied)).toMatchObject({ body: '', account_id: null });
    expect(JSON.stringify(all)).not.toContain('lonely');
    expect((await call(alice.client, 'GET', '/api/me')).body.account).toBeNull();
    expect((await call(newClient(), 'POST', '/api/session', { authKey: (await deriveKeys(alice.readerKey)).authKey })).status).toBe(401);
  });
});
