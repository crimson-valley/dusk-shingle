# Dusk Shingle

A quiet, reader-facing publication surface for *Dusk Shingle*.

## Local development

```bash
npm install
npm run dev
```

The app is a small Vite + React + TypeScript single-page application. It uses the browser history API so the library and chapter routes remain deep-linkable without adding a routing dependency.

## Publication source

Public chapter data lives in `src/content/chapters.ts`. Only entries with `status: 'published'` are exposed to the library and chapter routes. The current repository does not contain any published prose, so the reader currently presents the empty public-edition state rather than inventing or exposing story content. Add published chapters to the collection when reader-ready material exists; the library, chapter renderer, progress indicator, settings, and previous/next navigation will use them automatically.

Each chapter supports:

- a stable `slug` and numeric `number`
- an optional volume and publication label
- paragraphs, epigraphs, and section breaks
- adjacent chapter navigation derived from the published collection

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Routes

- `/` — reader library
- `/library` — library alias
- `/chapter/:slug` — published chapter reading view

`vercel.json` rewrites reader routes to the Vite entry point while allowing built assets to be served directly.
