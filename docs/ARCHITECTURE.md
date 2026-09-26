# Architecture, security & privacy (internal)

This document describes what is **actually implemented**. It is the technical input for the
future Terms of Service and Privacy Policy, which are intentionally **not** written here.

## Shape

- `src/` — Vite + React SPA (reader, library, discussions, account). History-API routing, no router dependency.
- `api/router.ts` — one Vercel Function. `vercel.json` rewrites `/api/:route*` → `/api/router?route=…`.
- `server/` — framework-neutral handlers (`router.ts`), Postgres access (`db.ts`, `pg` in production,
  PGlite for local dev and tests), security primitives (`security.ts`), schema (`schema.ts`, idempotent,
  applied on first request per instance).
- `src/content/catalog.ts` — chapter metadata shared by UI and API. Prose stays in `src/content/chapters/`.
  Adding a chapter = one catalog entry + one source registration in `chapters.ts`.

Environment: `DATABASE_URL` (or `POSTGRES_URL`) and `RATE_LIMIT_SECRET` (32+ random bytes). Server-only;
nothing is exposed to the client bundle (no `VITE_*` variables are used). Without a database the API
answers `503 not_configured` and the UI states that accounts/discussions are not connected; reading is unaffected.

## Anonymous accounts & keys

```
reader key  = "dusk1-" + base64url(32 bytes, crypto.getRandomValues)     ← generated in the browser, shown once
authKey     = HKDF-SHA256(readerKey, salt="dusk-shingle/hkdf-salt/v1", info="dusk-shingle/auth/v1")
KEK         = HKDF-SHA256(readerKey, same salt, info="dusk-shingle/vault-kek/v1")  → AES-GCM-256, non-extractable, wrap/unwrap only
DEK         = random AES-GCM-256 data key, wrapped by KEK (AAD "dusk-shingle/dek-wrap/v1")
vault       = AES-GCM(DEK, JSON, 96-bit random IV, AAD "dusk-shingle/vault/v1")
server      stores auth_hash = SHA-256("dusk-shingle/auth/v1\0" || authKey)
```

- The **server never receives the reader key or the KEK**. It receives `authKey` only, and HKDF is one-way, so
  the server cannot derive the KEK. HKDF (not Argon2/PBKDF2) is correct because the input is a uniformly random
  256-bit secret; a slow KDF only helps low-entropy passwords.
- Uniqueness: `accounts.auth_hash UNIQUE`. On collision (≈2⁻¹²⁸) the API returns `409 key_collision` and the
  client regenerates. Public handles (`UNIQUE`) are generated server-side from word lists + CSPRNG and retried on
  collision; they are unrelated to the key. Internal UUIDs are never returned by the API except comment IDs.
- Sessions: a separate random 256-bit secret in a cookie `__Host-dusk_session` (`HttpOnly; Secure; SameSite=Strict;
  Path=/`, 180 days); DB stores only its SHA-256. JS cannot read it. "Sign out everywhere" deletes all sessions.
- On the device: the reader key is **not persisted**. The DEK is stored in IndexedDB as a **non-extractable**
  `CryptoKey`. Reading state is cached in `localStorage` (plaintext on the reader's own device). Sign-out and
  deletion clear IndexedDB, localStorage and sessionStorage.
- **Lost key:** there is no recovery. No email/phone/identity exists to reset against and the server holds only a
  hash. While a device is still signed in, the account remains usable there (and can be deleted), but the key
  cannot be displayed again. A recovery mechanism, if ever wanted, must be designed explicitly.
- CSRF: every non-GET requires header `X-Dusk-Client: 1` (forces CORS preflight; no CORS is enabled) and, when
  present, `Origin` must equal the host. Plus `SameSite=Strict`.

## End-to-end encryption boundary

| Data | Where plaintext exists | What the server stores | E2EE? |
|---|---|---|---|
| Reading positions, completion, last chapter | reader's devices | AES-GCM ciphertext + version | **Yes** |
| Private chapter notes | reader's devices | inside the same ciphertext | **Yes** |
| Appearance preferences (when signed in) | reader's devices | inside the same ciphertext | **Yes** |
| Public comments, replies | everyone | plaintext (DB encrypted at rest by provider) | **No** — must be distributed & moderated |
| Reactions, reports, pseudonym | server | plaintext | No |

Honest caveats: (1) as with any web app, the server delivers the JavaScript that performs encryption, so a
compromised deployment could ship malicious code — E2EE protects stored data against the database/operator, not
against a malicious build; (2) ciphertext length and vault update times are visible to the server;
(3) the server can see *that* an account syncs, and when.

## Sync & conflicts

Optimistic concurrency: `PUT /api/vault {baseVersion}` succeeds only if the stored version matches, otherwise
`409` returns the current ciphertext; the client decrypts, merges, retries (≤4). Merge (`src/lib/readerState.ts`)
is deterministic, commutative, associative, idempotent: completion is sticky (OR); position = most recent update
(tie → larger); last chapter = most recent (tie → larger slug); prefs/notes = most recent (tie → stable JSON order).
Device clocks only compare the same reader's devices. Offline changes stay local (`dirty` flag) and sync on
`online`/focus. Corrupted ciphertext fails authentication and **nothing is applied**; decrypted JSON is sanitised.

## Spoiler model

Every comment belongs to a chapter room and declares `reveals_through` (≥ that chapter, ≤ latest published —
enforced server-side). Because reading progress is E2EE, the **server cannot know what a reader has read**, so
concealment decisions happen client-side: (1) a room for an unfinished chapter asks before opening;
(2) comments reaching beyond the reader's finished chapters are folded; (3) inline `||text||` renders as a
redaction bar until activated. Reports can flag unmarked spoilers.

## Moderation & abuse

Postgres fixed-window rate limits (per account for authenticated actions; per daily-rotating HMAC of the IP for
account creation/sign-in — the IP itself is never stored; buckets purged after 2 days). New accounts (<10 min)
may post 2 comments/10 min; others 6/10 min, 40/day. Duplicate text within an hour, >2 URLs, >4000 chars and
control/bidi-override characters are rejected/stripped. Content is rendered as React text only — no HTML, no
markdown links, no autolinks. Three independent unresolved reports auto-hide a comment pending review.
Moderators are accounts with `role='moderator'` set **directly in the database** (no UI or API grants roles);
every moderation endpoint checks the role server-side.

## Deletion

`DELETE /api/account` (requires the phrase): comments without replies are deleted; comments with replies become
tombstones (body emptied, author detached); orphaned tombstones are removed; then the account row is deleted,
cascading sessions, vault, reactions and reports filed. The client clears all local state. Nothing else is retained.
Infrastructure (Vercel, database provider) may retain request logs/backups under their own policies.

## Data inventory

**Application data:** `accounts(id, auth_hash, handle, role, created_at, replies_seen_at)`, `sessions(id_hash,
account_id, expires_at)`, `vaults(account_id, version, wrapped_key, ciphertext, updated_at)`, `comments(…)`,
`reactions(comment_id, account_id)`, `reports(…, reason, note)`, `rate_events(bucket, window_start, count)`.
`created_at` exists for new-account rate limits; `replies_seen_at` for reply notifications.

**Technical metadata (infrastructure):** Vercel processes IP addresses, user agents and request paths for
routing/logging; the app does not store them. Application logs contain only `[api] METHOD /path failed: ErrorName`
with UUIDs masked — never bodies, cookies, keys or query parameters. No analytics, pixels, third-party scripts,
fonts from CDNs, or fingerprinting. Fonts are self-hosted. Strict CSP (`script-src 'self'`, `connect-src 'self'`).
