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

Set `DATABASE_URL` (or `POSTGRES_URL`, e.g. via the Neon integration) and `RATE_LIMIT_SECRET` in the project's
environment variables. The schema is created automatically on first request. Moderators are designated with
`UPDATE accounts SET role = 'moderator' WHERE handle = '…';`.

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Routes

`/` library · `/chapter/:slug` reader · `/chapter/:slug/discussion` · `/discussions` · `/account` · `/moderation`
