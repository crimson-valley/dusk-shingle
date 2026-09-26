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
