import type { Db } from './db.js';
import { ApiError, json, type ApiRequest, type ApiResponse } from './http.js';
import {
  cleanText,
  consumeRateLimit,
  countUrls,
  hashSecret,
  isUuid,
  isWellFormedKey,
  networkBucket,
  newHandle,
  newId,
  newSessionSecret,
  type Limit,
} from './security.js';
import { latestPublishedNumber, publishedCatalog, publishedChapterNumber } from '../src/content/catalog.js';

const SESSION_DAYS = 180;
const MAX_COMMENT = 4000;

const LIMITS = {
  createAccount: { max: 5, windowSeconds: 3600 },
  signIn: { max: 20, windowSeconds: 900 },
  comment: { max: 6, windowSeconds: 600 },
  commentNewAccount: { max: 2, windowSeconds: 600 },
  commentDaily: { max: 40, windowSeconds: 86400 },
  edit: { max: 30, windowSeconds: 600 },
  reaction: { max: 60, windowSeconds: 600 },
  report: { max: 10, windowSeconds: 3600 },
  vault: { max: 120, windowSeconds: 600 },
} satisfies Record<string, Limit>;

type Account = { id: string; handle: string; role: 'reader' | 'moderator'; created_at: Date };

type Ctx = { db: Db; req: ApiRequest; params: string[] };
type Handler = (ctx: Ctx) => Promise<ApiResponse>;

// ───────────────────────── helpers ─────────────────────────

function secure(req: ApiRequest): boolean {
  return (req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
}

function cookieName(req: ApiRequest): string {
  return secure(req) ? '__Host-dusk_session' : 'dusk_session';
}

function sessionCookie(req: ApiRequest, value: string, maxAge: number): string {
  return [
    `${cookieName(req)}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    secure(req) ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function readSessionCookie(req: ApiRequest): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === cookieName(req)) return rest.join('=');
  }
  return undefined;
}

async function limit(db: Db, bucket: string, rule: Limit) {
  if (!(await consumeRateLimit(db, bucket, rule))) {
    throw new ApiError(429, 'rate_limited', 'You are doing that too often. Please wait a little and try again.', {
      retryAfterSeconds: rule.windowSeconds,
    });
  }
}

async function optionalAccount(ctx: Ctx): Promise<Account | undefined> {
  const secret = readSessionCookie(ctx.req);
  if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return undefined;
  const { rows } = await ctx.db.query<Account>(
    `SELECT a.id, a.handle, a.role, a.created_at FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.id_hash = $1 AND s.expires_at > now()`,
    [hashSecret('session', secret)],
  );
  return rows[0];
}

async function requireAccount(ctx: Ctx): Promise<Account> {
  const account = await optionalAccount(ctx);
  if (!account) throw new ApiError(401, 'signed_out', 'Your session has ended. Sign in with your reader key to continue.');
  return account;
}

async function startSession(db: Db, req: ApiRequest, accountId: string): Promise<string> {
  const secret = newSessionSecret();
  await db.query(`INSERT INTO sessions (id_hash, account_id, expires_at) VALUES ($1, $2, now() + $3::interval)`, [
    hashSecret('session', secret),
    accountId,
    `${SESSION_DAYS} days`,
  ]);
  await db.query(`DELETE FROM sessions WHERE account_id = $1 AND expires_at < now()`, [accountId]);
  return sessionCookie(req, secret, SESSION_DAYS * 86400);
}

function body(req: ApiRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body as Record<string, unknown>;
  throw new ApiError(400, 'bad_request', 'The request could not be read.');
}

function chapterNumberOrThrow(slug: string): number {
  const n = publishedChapterNumber(slug);
  if (!n) throw new ApiError(404, 'no_chapter', 'That chapter is not part of the published edition.');
  return n;
}

function validateCommentBody(raw: unknown): { text: string; hasSpoiler: boolean } {
  if (typeof raw !== 'string') throw new ApiError(400, 'bad_request', 'A comment needs some text.');
  const text = cleanText(raw);
  if (!text) throw new ApiError(400, 'empty', 'A comment needs some text.');
  if (text.length > MAX_COMMENT) throw new ApiError(400, 'too_long', `Comments are limited to ${MAX_COMMENT} characters.`);
  if (countUrls(text) > 2) throw new ApiError(400, 'too_many_links', 'Comments may include at most two links.');
  return { text, hasSpoiler: /\|\|[^|]+\|\|/.test(text) };
}

function validateReveals(raw: unknown, chapterNumber: number): number {
  const value = raw === undefined ? chapterNumber : raw;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < chapterNumber || value > latestPublishedNumber()) {
    throw new ApiError(400, 'bad_spoiler_scope', 'Choose which chapters this comment discusses.');
  }
  return value;
}

type CommentRow = {
  id: string;
  parent_id: string | null;
  account_id: string | null;
  handle: string | null;
  body: string;
  reveals_through: number;
  has_spoiler: boolean;
  state: string;
  created_at: Date;
  edited_at: Date | null;
  deleted_at: Date | null;
  reactions: string | number;
  reacted: boolean;
};

function presentComment(row: CommentRow, viewer?: Account) {
  const mine = Boolean(viewer && row.account_id === viewer.id);
  const moderator = viewer?.role === 'moderator';
  const deleted = Boolean(row.deleted_at);
  const concealed = !deleted && row.state !== 'visible' && !mine && !moderator;
  return {
    id: row.id,
    parentId: row.parent_id,
    author: deleted ? null : row.handle,
    body: deleted || concealed ? '' : row.body,
    status: deleted ? 'deleted' : row.state === 'visible' ? 'visible' : row.state,
    revealsThrough: row.reveals_through,
    hasSpoiler: row.has_spoiler,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    reactions: deleted ? 0 : Number(row.reactions),
    reacted: row.reacted,
    mine,
  };
}

async function loadOwnedComment(db: Db, id: string, account: Account) {
  if (!isUuid(id)) throw new ApiError(404, 'no_comment', 'That comment no longer exists.');
  const { rows } = await db.query<{ id: string; account_id: string | null; chapter_slug: string; deleted_at: Date | null; state: string }>(
    `SELECT id, account_id, chapter_slug, deleted_at, state FROM comments WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row || row.deleted_at) throw new ApiError(404, 'no_comment', 'That comment no longer exists.');
  if (row.account_id !== account.id) throw new ApiError(403, 'not_yours', 'You can only change your own comments.');
  return row;
}

/** Delete or tombstone a comment, then clean up tombstones left without replies. */
async function removeComment(db: Db, id: string) {
  const { rows } = await db.query<{ n: string | number }>(`SELECT count(*) AS n FROM comments WHERE parent_id = $1`, [id]);
  if (Number(rows[0].n) > 0) {
    await db.query(`UPDATE comments SET body = '', account_id = NULL, deleted_at = now(), has_spoiler = false WHERE id = $1`, [id]);
    await db.query(`DELETE FROM reactions WHERE comment_id = $1`, [id]);
  } else {
    const parent = await db.query<{ parent_id: string | null }>(`DELETE FROM comments WHERE id = $1 RETURNING parent_id`, [id]);
    const parentId = parent.rows[0]?.parent_id;
    if (parentId) {
      await db.query(
        `DELETE FROM comments p WHERE p.id = $1 AND p.deleted_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.parent_id = p.id)`,
        [parentId],
      );
    }
  }
}

// ───────────────────────── handlers ─────────────────────────

const health: Handler = async () => json(200, { ok: true, database: true });

const createAccount: Handler = async ({ db, req }) => {
  await limit(db, networkBucket('create', req.ip), LIMITS.createAccount);
  const { authKey } = body(req);
  if (!isWellFormedKey(authKey)) throw new ApiError(400, 'bad_request', 'The reader key was malformed.');
  const authHash = hashSecret('auth', authKey);

  const existing = await db.query(`SELECT 1 FROM accounts WHERE auth_hash = $1`, [authHash]);
  if (existing.rows.length) {
    // Astronomically unlikely with 256-bit keys; the client generates a fresh key and retries.
    throw new ApiError(409, 'key_collision', 'Please try again.');
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = newId();
    const handle = newHandle();
    try {
      await db.query(`INSERT INTO accounts (id, auth_hash, handle) VALUES ($1, $2, $3)`, [id, authHash, handle]);
      const cookie = await startSession(db, req, id);
      return json(201, { handle, role: 'reader' }, [cookie]);
    } catch (error) {
      const code = (error as { code?: string }).code;
      const detail = String((error as { constraint?: string; message?: string }).constraint ?? (error as Error).message);
      if (code !== '23505') throw error;
      if (detail.includes('auth_hash')) throw new ApiError(409, 'key_collision', 'Please try again.');
      // handle collision → retry with a new pseudonym
    }
  }
  throw new ApiError(503, 'busy', 'We could not create an account just now. Please try again.');
};

const signIn: Handler = async ({ db, req }) => {
  await limit(db, networkBucket('signin', req.ip), LIMITS.signIn);
  const { authKey } = body(req);
  if (!isWellFormedKey(authKey)) throw new ApiError(401, 'unknown_key', 'That reader key does not match an account.');
  const { rows } = await db.query<{ id: string; handle: string; role: string }>(
    `SELECT id, handle, role FROM accounts WHERE auth_hash = $1`,
    [hashSecret('auth', authKey)],
  );
  if (!rows[0]) throw new ApiError(401, 'unknown_key', 'That reader key does not match an account.');
  const cookie = await startSession(db, req, rows[0].id);
  return json(200, { handle: rows[0].handle, role: rows[0].role }, [cookie]);
};

const signOut: Handler = async ({ db, req }) => {
  const secret = readSessionCookie(req);
  if (secret) await db.query(`DELETE FROM sessions WHERE id_hash = $1`, [hashSecret('session', secret)]);
  return json(200, { ok: true }, [sessionCookie(req, '', 0)]);
};

const signOutEverywhere: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  await ctx.db.query(`DELETE FROM sessions WHERE account_id = $1`, [account.id]);
  return json(200, { ok: true }, [sessionCookie(ctx.req, '', 0)]);
};

const me: Handler = async (ctx) => {
  const account = await optionalAccount(ctx);
  if (!account) return json(200, { account: null });
  return json(200, { account: { handle: account.handle, role: account.role } });
};

const deleteAccount: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  if (body(ctx.req).confirm !== 'delete my account') {
    throw new ApiError(400, 'confirm', 'Type the confirmation phrase to delete your account.');
  }
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM comments WHERE account_id = $1 AND deleted_at IS NULL ORDER BY parent_id NULLS FIRST`,
      [account.id],
    );
    // Replies first so parents with only this reader's replies are fully removed.
    for (const row of rows.reverse()) await removeComment(tx, row.id);
    await tx.query(`DELETE FROM accounts WHERE id = $1`, [account.id]); // cascades sessions, vault, reactions, reports
  });
  return json(200, { ok: true }, [sessionCookie(ctx.req, '', 0)]);
};

const getVault: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  const { rows } = await ctx.db.query<{ version: number; wrapped_key: string; ciphertext: string }>(
    `SELECT version, wrapped_key, ciphertext FROM vaults WHERE account_id = $1`,
    [account.id],
  );
  if (!rows[0]) return json(200, { vault: null });
  return json(200, { vault: { version: rows[0].version, wrappedKey: rows[0].wrapped_key, ciphertext: rows[0].ciphertext } });
};

const B64 = /^[A-Za-z0-9_-]+$/;

const putVault: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  await limit(ctx.db, `vault:${account.id}`, LIMITS.vault);
  const { baseVersion, wrappedKey, ciphertext } = body(ctx.req);
  if (
    !(baseVersion === 0 || (typeof baseVersion === 'number' && Number.isInteger(baseVersion) && baseVersion > 0)) ||
    typeof wrappedKey !== 'string' || wrappedKey.length > 512 || !B64.test(wrappedKey) ||
    typeof ciphertext !== 'string' || ciphertext.length > 90000 || !B64.test(ciphertext)
  ) {
    throw new ApiError(400, 'bad_vault', 'The encrypted reading state was malformed.');
  }
  const result = await ctx.db.query<{ version: number }>(
    baseVersion === 0
      ? `INSERT INTO vaults (account_id, version, wrapped_key, ciphertext) VALUES ($1, 1, $2, $3)
         ON CONFLICT (account_id) DO NOTHING RETURNING version`
      : `UPDATE vaults SET version = version + 1, wrapped_key = $2, ciphertext = $3, updated_at = now()
         WHERE account_id = $1 AND version = $4 RETURNING version`,
    baseVersion === 0 ? [account.id, wrappedKey, ciphertext] : [account.id, wrappedKey, ciphertext, baseVersion],
  );
  if (!result.rows[0]) {
    const current = await ctx.db.query<{ version: number; wrapped_key: string; ciphertext: string }>(
      `SELECT version, wrapped_key, ciphertext FROM vaults WHERE account_id = $1`,
      [account.id],
    );
    const v = current.rows[0];
    throw new ApiError(409, 'stale', 'Your reading state changed on another device.', {
      vault: v ? { version: v.version, wrappedKey: v.wrapped_key, ciphertext: v.ciphertext } : null,
    });
  }
  return json(200, { version: result.rows[0].version });
};

const listComments: Handler = async (ctx) => {
  const slug = ctx.params[0];
  chapterNumberOrThrow(slug);
  const viewer = await optionalAccount(ctx);
  const { rows } = await ctx.db.query<CommentRow>(
    `SELECT c.id, c.parent_id, c.account_id, a.handle, c.body, c.reveals_through, c.has_spoiler, c.state,
            c.created_at, c.edited_at, c.deleted_at,
            (SELECT count(*) FROM reactions r WHERE r.comment_id = c.id) AS reactions,
            EXISTS (SELECT 1 FROM reactions r WHERE r.comment_id = c.id AND r.account_id = $2) AS reacted
     FROM comments c LEFT JOIN accounts a ON a.id = c.account_id
     WHERE c.chapter_slug = $1 AND c.state <> 'removed' OR (c.chapter_slug = $1 AND c.account_id = $2)
     ORDER BY c.created_at ASC LIMIT 1000`,
    [slug, viewer?.id ?? null],
  );
  return json(200, { comments: rows.map((r) => presentComment(r, viewer)), viewer: viewer ? { handle: viewer.handle, role: viewer.role } : null });
};

const createComment: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  const slug = ctx.params[0];
  const chapterNumber = chapterNumberOrThrow(slug);
  const input = body(ctx.req);
  const { text, hasSpoiler } = validateCommentBody(input.body);
  const reveals = validateReveals(input.revealsThrough, chapterNumber);

  let parentId: string | null = null;
  if (input.parentId !== undefined && input.parentId !== null) {
    if (!isUuid(input.parentId)) throw new ApiError(400, 'bad_parent', 'That comment cannot be replied to.');
    const parent = await ctx.db.query<{ id: string; parent_id: string | null; chapter_slug: string; deleted_at: Date | null; state: string }>(
      `SELECT id, parent_id, chapter_slug, deleted_at, state FROM comments WHERE id = $1`,
      [input.parentId],
    );
    const p = parent.rows[0];
    if (!p || p.chapter_slug !== slug || p.deleted_at || p.state !== 'visible') {
      throw new ApiError(400, 'bad_parent', 'That comment can no longer be replied to.');
    }
    parentId = p.parent_id ?? p.id; // threads are one level deep
  }

  const dupe = await ctx.db.query(
    `SELECT 1 FROM comments WHERE account_id = $1 AND body = $2 AND created_at > now() - interval '1 hour'`,
    [account.id, text],
  );
  if (dupe.rows.length) throw new ApiError(409, 'duplicate', 'You have already posted this.');

  const isNew = Date.now() - new Date(account.created_at).getTime() < 10 * 60 * 1000;
  await limit(ctx.db, `comment:${account.id}`, isNew ? LIMITS.commentNewAccount : LIMITS.comment);
  await limit(ctx.db, `comment-day:${account.id}`, LIMITS.commentDaily);
  const id = newId();
  await ctx.db.query(
    `INSERT INTO comments (id, chapter_slug, parent_id, account_id, body, reveals_through, has_spoiler)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, slug, parentId, account.id, text, reveals, hasSpoiler],
  );
  return json(201, { id });
};

const editComment: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  await limit(ctx.db, `edit:${account.id}`, LIMITS.edit);
  const row = await loadOwnedComment(ctx.db, ctx.params[0], account);
  if (row.state === 'removed') throw new ApiError(403, 'moderated', 'This comment was removed by moderation and cannot be edited.');
  const input = body(ctx.req);
  const { text, hasSpoiler } = validateCommentBody(input.body);
  const reveals = validateReveals(input.revealsThrough, chapterNumberOrThrow(row.chapter_slug));
  await ctx.db.query(
    `UPDATE comments SET body = $2, has_spoiler = $3, reveals_through = $4, edited_at = now() WHERE id = $1`,
    [row.id, text, hasSpoiler, reveals],
  );
  return json(200, { ok: true });
};

const deleteComment: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  const row = await loadOwnedComment(ctx.db, ctx.params[0], account);
  await ctx.db.transaction((tx) => removeComment(tx, row.id));
  return json(200, { ok: true });
};

async function reactableComment(db: Db, id: string) {
  if (!isUuid(id)) throw new ApiError(404, 'no_comment', 'That comment no longer exists.');
  const { rows } = await db.query<{ id: string; account_id: string | null }>(
    `SELECT id, account_id FROM comments WHERE id = $1 AND deleted_at IS NULL AND state = 'visible'`,
    [id],
  );
  if (!rows[0]) throw new ApiError(404, 'no_comment', 'That comment no longer exists.');
  return rows[0];
}

const addReaction: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  await limit(ctx.db, `reaction:${account.id}`, LIMITS.reaction);
  const comment = await reactableComment(ctx.db, ctx.params[0]);
  if (comment.account_id === account.id) throw new ApiError(400, 'own_comment', 'You cannot mark your own comment.');
  await ctx.db.query(`INSERT INTO reactions (comment_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [comment.id, account.id]);
  return json(200, { ok: true });
};

const removeReaction: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  if (!isUuid(ctx.params[0])) throw new ApiError(404, 'no_comment', 'That comment no longer exists.');
  await ctx.db.query(`DELETE FROM reactions WHERE comment_id = $1 AND account_id = $2`, [ctx.params[0], account.id]);
  return json(200, { ok: true });
};

const REPORT_REASONS = ['spoiler', 'harassment', 'spam', 'other'];
const AUTO_HIDE_REPORTS = 3;

const reportComment: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  await limit(ctx.db, `report:${account.id}`, LIMITS.report);
  const comment = await reactableComment(ctx.db, ctx.params[0]);
  if (comment.account_id === account.id) throw new ApiError(400, 'own_comment', 'You cannot report your own comment.');
  const { reason, note } = body(ctx.req);
  if (typeof reason !== 'string' || !REPORT_REASONS.includes(reason)) throw new ApiError(400, 'bad_reason', 'Choose a reason for the report.');
  const cleanNote = typeof note === 'string' ? cleanText(note).slice(0, 500) || null : null;
  await ctx.db.query(
    `INSERT INTO reports (id, comment_id, reporter_id, reason, note) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (comment_id, reporter_id) DO NOTHING`,
    [newId(), comment.id, account.id, reason, cleanNote],
  );
  // Community safety valve: enough independent reports hide the comment pending moderator review.
  await ctx.db.query(
    `UPDATE comments SET state = 'hidden' WHERE id = $1 AND state = 'visible'
     AND (SELECT count(*) FROM reports WHERE comment_id = $1 AND resolved_at IS NULL) >= $2`,
    [comment.id, AUTO_HIDE_REPORTS],
  );
  return json(200, { ok: true });
};

const notifications: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  const { rows } = await ctx.db.query<{ id: string; chapter_slug: string; parent_id: string; handle: string | null; created_at: Date; unread: boolean }>(
    `SELECT r.id, r.chapter_slug, r.parent_id, a.handle, r.created_at,
            r.created_at > me.replies_seen_at AS unread
     FROM comments r
     JOIN comments p ON p.id = r.parent_id
     JOIN accounts me ON me.id = $1
     LEFT JOIN accounts a ON a.id = r.account_id
     WHERE p.account_id = $1 AND (r.account_id IS NULL OR r.account_id <> $1)
       AND r.deleted_at IS NULL AND r.state = 'visible'
     ORDER BY r.created_at DESC LIMIT 20`,
    [account.id],
  );
  const moderated = await ctx.db.query<{ id: string; chapter_slug: string; state: string }>(
    `SELECT id, chapter_slug, state FROM comments WHERE account_id = $1 AND state <> 'visible' AND deleted_at IS NULL LIMIT 20`,
    [account.id],
  );
  return json(200, {
    replies: rows.map((r) => ({ id: r.id, chapterSlug: r.chapter_slug, parentId: r.parent_id, author: r.handle, createdAt: r.created_at, unread: r.unread })),
    moderated: moderated.rows.map((m) => ({ id: m.id, chapterSlug: m.chapter_slug, state: m.state })),
  });
};

const markNotificationsSeen: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  await ctx.db.query(`UPDATE accounts SET replies_seen_at = now() WHERE id = $1`, [account.id]);
  return json(200, { ok: true });
};

const discussions: Handler = async ({ db }) => {
  const { rows } = await db.query<{ chapter_slug: string; n: string | number; latest: Date }>(
    `SELECT chapter_slug, count(*) AS n, max(created_at) AS latest FROM comments
     WHERE deleted_at IS NULL AND state = 'visible' GROUP BY chapter_slug`,
  );
  const bySlug = new Map(rows.map((r) => [r.chapter_slug, r]));
  return json(200, {
    chapters: publishedCatalog().map((c) => ({
      slug: c.slug,
      comments: Number(bySlug.get(c.slug)?.n ?? 0),
      latest: bySlug.get(c.slug)?.latest ?? null,
    })),
  });
};

async function requireModerator(ctx: Ctx): Promise<Account> {
  const account = await requireAccount(ctx);
  if (account.role !== 'moderator') throw new ApiError(403, 'forbidden', 'This area is for moderators.');
  return account;
}

const moderationQueue: Handler = async (ctx) => {
  await requireModerator(ctx);
  const { rows } = await ctx.db.query<{ id: string; chapter_slug: string; body: string; state: string; handle: string | null; reports: string | number; reasons: string[] }>(
    `SELECT c.id, c.chapter_slug, c.body, c.state, a.handle, count(r.id) AS reports, array_agg(DISTINCT r.reason) AS reasons
     FROM reports r JOIN comments c ON c.id = r.comment_id LEFT JOIN accounts a ON a.id = c.account_id
     WHERE r.resolved_at IS NULL AND c.deleted_at IS NULL
     GROUP BY c.id, a.handle ORDER BY count(r.id) DESC LIMIT 100`,
  );
  return json(200, { items: rows.map((r) => ({ id: r.id, chapterSlug: r.chapter_slug, body: r.body, state: r.state, author: r.handle, reports: Number(r.reports), reasons: r.reasons })) });
};

const moderate: Handler = async (ctx) => {
  await requireModerator(ctx);
  const id = ctx.params[0];
  if (!isUuid(id)) throw new ApiError(404, 'no_comment', 'That comment no longer exists.');
  const { state } = body(ctx.req);
  if (state !== 'visible' && state !== 'hidden' && state !== 'removed') throw new ApiError(400, 'bad_state', 'Unknown moderation state.');
  const result = await ctx.db.query(`UPDATE comments SET state = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id, state]);
  if (!result.rows.length) throw new ApiError(404, 'no_comment', 'That comment no longer exists.');
  await ctx.db.query(`UPDATE reports SET resolved_at = now() WHERE comment_id = $1 AND resolved_at IS NULL`, [id]);
  return json(200, { ok: true });
};

// ───────────────────────── routing ─────────────────────────

const routes: Array<[string, RegExp, Handler]> = [
  ['GET', /^\/api\/health$/, health],
  ['POST', /^\/api\/account$/, createAccount],
  ['DELETE', /^\/api\/account$/, deleteAccount],
  ['GET', /^\/api\/me$/, me],
  ['POST', /^\/api\/session$/, signIn],
  ['DELETE', /^\/api\/session$/, signOut],
  ['DELETE', /^\/api\/sessions$/, signOutEverywhere],
  ['GET', /^\/api\/vault$/, getVault],
  ['PUT', /^\/api\/vault$/, putVault],
  ['GET', /^\/api\/discussions$/, discussions],
  ['GET', /^\/api\/chapters\/([a-z0-9-]{1,80})\/comments$/, listComments],
  ['POST', /^\/api\/chapters\/([a-z0-9-]{1,80})\/comments$/, createComment],
  ['PATCH', /^\/api\/comments\/([^/]+)$/, editComment],
  ['DELETE', /^\/api\/comments\/([^/]+)$/, deleteComment],
  ['PUT', /^\/api\/comments\/([^/]+)\/reaction$/, addReaction],
  ['DELETE', /^\/api\/comments\/([^/]+)\/reaction$/, removeReaction],
  ['POST', /^\/api\/comments\/([^/]+)\/report$/, reportComment],
  ['GET', /^\/api\/notifications$/, notifications],
  ['POST', /^\/api\/notifications\/seen$/, markNotificationsSeen],
  ['GET', /^\/api\/moderation\/reports$/, moderationQueue],
  ['POST', /^\/api\/moderation\/comments\/([^/]+)$/, moderate],
];

/** CSRF defence for state-changing requests: custom header (forces CORS preflight) + same-origin check. */
function checkCsrf(req: ApiRequest) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  if (req.headers['x-dusk-client'] !== '1') throw new ApiError(403, 'csrf', 'This request was blocked for your protection.');
  const origin = req.headers.origin;
  if (origin) {
    const host = (req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      /* fallthrough */
    }
    if (!host || originHost !== host) throw new ApiError(403, 'csrf', 'This request was blocked for your protection.');
  }
}

export async function handle(req: ApiRequest, getDb: () => Promise<Db> | undefined): Promise<ApiResponse> {
  try {
    const match = routes.find(([method, pattern]) => method === req.method && pattern.test(req.path));
    if (!match) {
      const pathExists = routes.some(([, pattern]) => pattern.test(req.path));
      throw new ApiError(pathExists ? 405 : 404, pathExists ? 'method' : 'not_found', 'There is nothing here.');
    }
    checkCsrf(req);
    const dbPromise = getDb();
    if (!dbPromise) {
      throw new ApiError(503, 'not_configured', 'Accounts and discussions are not connected yet. Reading is unaffected.');
    }
    let db: Db;
    try {
      db = await dbPromise;
    } catch {
      throw new ApiError(503, 'db_unavailable', 'The reading room’s records are unavailable right now. Reading is unaffected.');
    }
    const [, pattern, handler] = match;
    const params = (req.path.match(pattern) ?? []).slice(1).map((p) => decodeURIComponent(p));
    return await handler({ db, req, params });
  } catch (error) {
    if (error instanceof ApiError) {
      return json(error.status, { error: { code: error.code, message: error.message, ...error.extra } });
    }
    // Log only the error class and route shape — never bodies, cookies, keys or parameters.
    console.error(`[api] ${req.method} ${req.path.replace(/[0-9a-f-]{36}/gi, ':id')} failed: ${(error as Error)?.name ?? 'Error'}`);
    return json(500, { error: { code: 'server', message: 'The server could not complete that request. Nothing was lost; please try again shortly.' } });
  }
}
