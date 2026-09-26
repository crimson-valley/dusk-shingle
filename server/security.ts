import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Db } from './db.js';

/** base64url-encoded 32-byte value (43 chars, no padding). */
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedKey(value: unknown): value is string {
  return typeof value === 'string' && KEY_PATTERN.test(value);
}

/**
 * Hash a high-entropy (256-bit) secret for storage/lookup. A fast hash is
 * appropriate here: inputs are uniformly random, so there is nothing for a
 * slow KDF to protect against. Domain-separated per purpose.
 */
export function hashSecret(purpose: 'auth' | 'session', secret: string): Buffer {
  return createHash('sha256').update(`dusk-shingle/${purpose}/v1\0`).update(secret).digest();
}

export function newSessionSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function newId(): string {
  return randomUUID();
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const ADJECTIVES = [
  'Pale', 'Quiet', 'Grey', 'Late', 'Still', 'Low', 'Dim', 'Salt', 'Slate', 'Ashen', 'Distant', 'Hollow',
  'Silver', 'Winter', 'Faint', 'Dusky', 'Worn', 'Mute', 'Cold', 'Slow', 'Lone', 'Tidal', 'Brackish', 'Umber',
];
const NOUNS = [
  'Heron', 'Lantern', 'Shale', 'Tide', 'Reed', 'Harbour', 'Plover', 'Cairn', 'Estuary', 'Gull', 'Weir', 'Moth',
  'Ember', 'Current', 'Jetty', 'Sluice', 'Willow', 'Marsh', 'Beacon', 'Pebble', 'Dune', 'Wren', 'Culvert', 'Kestrel',
];

/** Public pseudonym: generated independently of the credential; carries no information about it. */
export function newHandle(): string {
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const noun = NOUNS[randomInt(NOUNS.length)];
  return `${adjective} ${noun} ${randomInt(100, 1000)}`;
}

/** Normalise untrusted text: NFC, strip control/bidi-override chars, unify newlines, trim. */
export function cleanText(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B\uFEFF]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function countUrls(text: string): number {
  return (text.match(/https?:\/\/|www\./gi) ?? []).length;
}

let fallbackSecret: string | undefined;

/**
 * Pseudonymous rate-limit key for unauthenticated actions. The IP address is
 * never stored: it is HMAC'd with a server secret and the current day, so the
 * stored bucket cannot be reversed or linked across days.
 */
export function networkBucket(scope: string, ip: string): string {
  const secret = process.env.RATE_LIMIT_SECRET ?? (fallbackSecret ??= randomBytes(32).toString('hex'));
  const day = new Date().toISOString().slice(0, 10);
  return `${scope}:net:${createHmac('sha256', secret).update(`${day}|${ip}`).digest('base64url').slice(0, 22)}`;
}

export type Limit = { max: number; windowSeconds: number };

/** Fixed-window counter in Postgres. Returns true when the action is allowed. */
export async function consumeRateLimit(db: Db, bucket: string, limit: Limit): Promise<boolean> {
  const windowMs = limit.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const { rows } = await db.query<{ count: number }>(
    `INSERT INTO rate_events (bucket, window_start, count) VALUES ($1, $2, 1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_events.count + 1
     RETURNING count`,
    [bucket, windowStart],
  );
  if (Math.random() < 0.02) {
    await db.query(`DELETE FROM rate_events WHERE window_start < now() - interval '2 days'`);
  }
  return Number(rows[0].count) <= limit.max;
}
