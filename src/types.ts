export type ChapterStatus = 'published' | 'forthcoming' | 'draft';

export type ChapterBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'section-break' }
  | { type: 'epigraph'; text: string; attribution?: string };

export type Chapter = {
  slug: string;
  number: number;
  title: string;
  volume?: string;
  publishedLabel?: string;
  status: ChapterStatus;
  blocks: ChapterBlock[];
};

export type Publication = {
  title: string;
  shortTitle: string;
  description: string;
  statusLabel: string;
  editionLabel: string;
  titleNoteLabel: string;
};
