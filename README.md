# Dusk Shingle

A quiet, reader-facing publication surface for *Dusk Shingle*.

## Local development

```bash
npm install
npm run dev        # API (server/dev.ts, on-disk PGlite in .data/) + Vite on :5173, /api proxied
```

## Architecture

Vite + React SPA with one Vercel Function (`api/router.ts`) backed by Postgres. Anonymous accounts (a single
browser-generated reader key, no identity data), end-to-end encrypted reading-state sync, chapter discussions
with a spoiler model, moderation and full account deletion. See `docs/ARCHITECTURE.md` (security, crypto,
privacy data inventory) and `docs/DESIGN.md` (design system).

## Content

Chapter metadata lives in `src/content/catalog.ts`; prose sources are registered in `src/content/chapters.ts`.
Only `published` entries reach the library, reader and API.

## Search & crawling

`public/robots.txt` and `public/sitemap.xml` are served at `/robots.txt` and `/sitemap.xml`. The sitemap is
regenerated from the published content source on every build (`npm run sitemap`) — never edit it by hand.
Canonical URLs (`src/lib/seo.ts`) use the production origin `https://dusk-shingle.vercel.app` and are kept
consistent with the sitemap. Account, moderation, API and not-found pages are excluded from both files and
marked `noindex`; robots directives are crawl hints only — access control stays in the application and API.

Deployment routing (`vercel.json`): every SPA route falls back to `/` so deep links resolve, `robots.txt`
and `sitemap.xml` are excluded from the fallback and served as real files, and the duplicate variants
`/library` and `/index.html` permanently redirect to `/`. Do not re-enable `cleanUrls` — it turns
`/index.html` into a redirect source and a fallback destination of `/index.html` then 404s every deep link.

## Deploy (Vercel)

The database is the Neon integration (`dusk-shingle-db`), which supplies `DATABASE_URL` to the
Production, Preview and Development environments. `RATE_LIMIT_SECRET` (32+ random bytes) must be
set on each environment too — the API refuses to serve IP rate limits without it rather than
silently resetting them on every cold start. The schema is created automatically on first request.
Moderators are designated with `UPDATE accounts SET role = 'moderator' WHERE handle = '…';`.

If the API answers `503 db_unavailable`, the deployment cannot reach its database. The reason is
logged (`vercel logs <url>`) with connection strings, passwords and user names redacted — without
that log line a dead database is indistinguishable from a healthy one. Note that a deleted or
expired database is the usual cause: the endpoint still accepts connections and then answers
`XX000 … tenant/user … not found` at the provider's gateway.

Only `pg` is exercised against a real network in production. Local dev and the test suite use PGlite
(`server/pglite.ts`), so `server/db.ts`'s connection options have no test coverage — a green
`npm test` does not prove the production database is reachable. Use `verify:production` for that.

## Secrets

The application reads exactly two environment variables: `DATABASE_URL` and `RATE_LIMIT_SECRET`.
Both must be Vercel **Secrets**, not Config — a Config value is stored in plaintext and is readable
by anyone with project access through the dashboard, CLI and API. Verify with:

```bash
vercel env ls        # every credential must read "Hidden" / "Secret"
```

Do not add `VITE_`/`PUBLIC_`/`NEXT_PUBLIC_` variables. Vite inlines those into the client bundle at
build time; nothing here uses `import.meta.env`, and that stays true. The Neon integration also
supplies `PGHOST`, `PGUSER`, `PGDATABASE` and friends, which this app never reads — they are
identifiers rather than credentials, but the connection strings and passwords it ships alongside them
(`POSTGRES_URL`, `PGPASSWORD`, `DATABASE_URL_UNPOOLED`, …) have been removed rather than left
readable. Expect the integration to offer to recreate them on a resync; delete them again.

`.env.example` is the only environment file in the repository and holds no real values. For local
work pull the values you need (`vercel env pull` writes `.env.local`, which is git-ignored and
contains live credentials — do not commit it or copy it anywhere shared).

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run verify:production   # drives the live site: accounts, discussions, routing, security
```

`verify:production` runs the release checklist against a deployed URL (default
`https://dusk-shingle.vercel.app`, or pass one as the first argument). It creates one throwaway
account and two comments, then deletes the comments again.

## Routes

`/` library · `/chapter/:slug` reader · `/chapter/:slug/discussion` · `/discussions` · `/account` · `/moderation`
