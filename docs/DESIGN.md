# Design system — "Dusk Shingle"

Tokens live in `src/styles/tokens.css`; nothing in components uses raw colours or sizes outside it.

## Research synthesis
- **From Apple (principles, not look):** content over chrome; whitespace as pedestal; tonal surface change as the
  divider (our *prelude* dark band → paper page); one quiet accent; weight restraint; no decorative shadows.
- **From Cursor (principles, not look):** warm paper instead of white; warm near-black ink; hairlines instead of
  elevation; display type at regular weight with slight negative tracking; compact precise controls; a mono
  voice for technical metadata.
- **Not taken:** SF Pro / CursorGothic, Action Blue, Cursor Orange, product tiles, frosted nav, pill CTAs,
  timeline pastels, marketing layouts.

## Identity
- **Motif — the horizon:** a single hairline. It separates *Dusk — Shingle* in the wordmark and marks where the
  dark chapter prelude meets the page. Dusk is the threshold before reading.
- **Accent — estuary slate** (`#2f5a61` / `#93b7b9`): used only for progress, focus, links-as-state, "read".
- **Surfaces:** page (paper `#f4f1ea` / dusk `#121315`), sunk (footer, gates, notices), raised (inputs, popover),
  threshold (prelude, key box). Surfaces are square; no cards.
- **Dusk mode** is designed: cool near-black ground with warm ink, re-tuned accent — not an inversion.

## Type
- Prose & display: Newsreader (variable, optical sizes; opsz 16 for text, 60–72 for titles, weight 350–400).
- UI: the system sans (native rendering, no download).
- Metadata: IBM Plex Mono 400/500, 11–13px, tracked uppercase labels.
- Prose: 19px, 1.64 leading, 34em (~66ch) measure; reader-adjustable size (4 steps) and measure (3 steps).

## Rules
Spacing 4px base (`--space-1…9`). Radius: 0 surfaces · 3px controls · 6px popover · pill for segmented only.
One shadow token, popovers only. Touch targets ≥44px. Motion 120/220/420ms, zero under reduced motion; nothing
moves during reading except the header stepping aside on downward scroll. All text pairs ≥4.5:1 (checked).
Hierarchy: novel → chapter → prose → controls → discussion → account.
