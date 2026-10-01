---
title: "Design System"
type: wiki
status: active
project: "dusk-shingle"
tags: [design-system, typography, color, dark-mode, tokens]
created: "2026-09-19"
---

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
  dark chapter threshold meets the page. Dusk is the threshold before reading.
- **Two voices, and only two.** The **serif speaks for the people**; the **mono speaks for the system** —
  running heads, metadata, alarm and log lines, pseudonyms, the reader's own generated handle. This is the
  sharpest rule in the system, and it is why the italic cut of the serif is not loaded (see *Type*).
- **Accent — estuary slate** (`#2f5a61` / `#93b7b9`): used only for progress, focus, links-as-state, "read".
- **Surfaces:** page (paper `#f4f1ea` / dusk `#121315`), sunk (footer, gates, notices), raised (inputs, popover),
  threshold (prelude, key box). Surfaces are square; no cards. Every surface carries the same paper grain.
- **Dusk mode** is designed: cool near-black ground with warm ink, re-tuned accent — not an inversion.
- **No gradients anywhere.** Depth comes from hairlines, tonal steps and one grain tile.

## Reading
- **The paragraph gap is locked to exactly one line of leading** (`--prose-gap: calc(var(--prose-leading) * 1em)`).
  This is the most important decision in the system. It puts every paragraph start on the same baseline grid, so
  the eye returns to the same height after every paragraph. Chapter 01 is 78% single-line paragraphs; an
  arbitrary gap made it read as a list, a leading-sized gap makes it read as prose. It re-scales itself whenever
  the reader changes size or leading.
- **One measure, four blocks.** `--prose-measure` is in `em`, so every block that uses it must resolve that `em`
  against the prose size — `.prelude-inner`, `.prose-wrap`, `.resume`, `.chapter-end` and `.chapter-nav` each
  declare `font-size: var(--prose-size)` for exactly this reason. Without it they silently size against the 16px
  root and the chapter's four vertical blocks stop sharing a left edge.
- **The machine's voice.** A paragraph that is nothing but an instrument reading (`**…**` alone) is set as its
  own mono block with a leading rule (`p[data-machine]`), so it lands on the baseline instead of straddling it.
  Inline emphasis stays inline. Detected in `ChapterBody`, never by editing the novel.
- **The threshold.** The prelude is short (42vh), textured, and carries the chapter number as a watermark at 5.5%
  opacity. It is a threshold before reading, not a hero band.
- **The margin rail.** Above 64rem the space beside the reading column holds the front matter and a standing
  progress readout, instead of leaving a large display mostly void. Symmetric side columns keep the reading column
  optically centred, and `minmax(0, …)` guarantees the rail can never widen the page.

## Type
- Prose & display: Newsreader (variable, optical sizes; opsz 16 for text, 72 for titles, weight 350–400).
- UI: the system sans (native rendering, no download).
- Metadata: IBM Plex Mono 400/500, 11–13px, tracked uppercase labels.
- **Newsreader is loaded roman only.** The italic cut is 147 KB and was used for six small asides; those now speak
  in mono, so a page costs half the font bytes. Nothing leans on a synthesised oblique — `cite` is set roman, and
  an epigraph (the one remaining italic case, not present in chapter 01) takes a browser-synthesised lean.
- Prose: 19px, 1.58 leading, 33em (≈65 characters); reader-adjustable size (4 steps) and measure (3 steps).
- **A reader's comments are prose too** and get the same measure discipline as the novel (`max-width: 36em`).

## Controls
- Text size is a four-step segmented control where **each option is drawn at the size it selects**, so the choice
  is made by looking rather than by remembering. Theme and line length match it; Reset returns all three.
- Below 40rem the panel becomes a bottom sheet inside thumb reach, and the segmented controls drop their pill
  radius — at that size a 999px radius stops reading as a segmented control and starts reading as stock mobile UI.
- Touch targets are ≥44px. Where a control is visually smaller (footer links), the hit area is grown with an
  overlay rather than by padding the row out.

## Forum
- **Community is a destination, not a sidebar.** One calm index: what readers are writing about (latest), what
  is being answered (most active), the categories, the chapter rooms, and the tags in use. A search box is the
  only control above the fold, capped to the width of a line of the page.
- **No social mechanics.** No follower counts, no trending, no badges, no reactions-on-reactions, no "hot",
  no infinite scroll. Pagination is a **Load more** button, because a literary forum should not take the
  scroll position away from a reader who is part-way through a sentence.
- **Prose, not cards.** Discussions are hairline-separated rows: mono category label, serif title, mono metadata.
  Categories are a hairline grid. Surfaces stay square; no shadows, no fills behind a list.
- **The spoiler model is visible.** An index row whose title would reach past the reader's finished chapters
  shows the reach instead of the title, with a deliberate "Read it anyway". Silent concealment would be a lie;
  the choice is the reader's. A concealed title is set in mono: it is withheld data, not a book title.
- **Tags are small and quiet:** mono, hairline border, 3px radius (not a pill — pills are reserved for
  segmented controls), and they link to a filtered list.
- **One composer per thread**, at the end of the conversation, where reading ends. Replies are one level deep,
  so a reply always means "reply to this discussion" and there is no ambiguous target.

## Rules
Spacing 4px base (`--space-1…9`). Radius: 0 surfaces → 3px controls → 6px popover → pill for segmented only.
One shadow token, popovers only. Motion 120/220/420ms, zero under reduced motion; nothing moves during reading
except the header stepping aside on downward scroll — and under reduced motion it does not move at all.
All text pairs ≥4.5:1 (verified by measurement, not by eye: 65 pairs across 5 pages × 2 themes).
Hierarchy: novel → chapter → prose → controls → community → discussion → account.
