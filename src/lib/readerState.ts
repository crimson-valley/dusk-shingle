/**
 * The private reader vault: the only reading data that is synchronised, and
 * it is encrypted on the device before upload (see crypto.ts).
 *
 * Merge is deterministic, commutative and idempotent so any two devices
 * converge regardless of order:
 *   • completed  — sticky: once finished on any device, stays finished
 *   • progress   — value from the most recent update (ties: larger progress)
 *   • last read  — most recent (ties: lexicographically larger slug)
 *   • prefs / notes — most recent update wins (ties: stable JSON order)
 * Timestamps are device clocks and only compare the reader's own devices.
 */

export type Theme = 'auto' | 'paper' | 'dusk';
export type FontSize = 'small' | 'standard' | 'large' | 'larger';
export type Measure = 'narrow' | 'standard' | 'wide';

export type Preferences = { theme: Theme; fontSize: FontSize; measure: Measure };
export const defaultPreferences: Preferences = { theme: 'auto', fontSize: 'standard', measure: 'standard' };

export type ChapterState = { progress: number; completed: boolean; updatedAt: number };
export type Note = { text: string; updatedAt: number };

export type VaultData = {
  v: 1;
  chapters: Record<string, ChapterState>;
  last?: { slug: string; at: number };
  prefs?: Preferences & { updatedAt: number };
  notes: Record<string, Note>;
};

export const emptyVault = (): VaultData => ({ v: 1, chapters: {}, notes: {} });

const SLUG = /^[a-z0-9-]{1,80}$/;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Validate untrusted/possibly-corrupted data; invalid entries are dropped, never trusted. */
export function sanitizeVault(input: unknown): VaultData {
  const out = emptyVault();
  if (!input || typeof input !== 'object') return out;
  const raw = input as Record<string, unknown>;
  if (raw.chapters && typeof raw.chapters === 'object') {
    for (const [slug, value] of Object.entries(raw.chapters as Record<string, unknown>)) {
      const c = value as Partial<ChapterState> | null;
      if (SLUG.test(slug) && c && num(c.progress) && num(c.updatedAt) && typeof c.completed === 'boolean') {
        out.chapters[slug] = { progress: clamp01(c.progress), completed: c.completed, updatedAt: c.updatedAt };
      }
    }
  }
  const last = raw.last as { slug?: unknown; at?: unknown } | undefined;
  if (last && typeof last.slug === 'string' && SLUG.test(last.slug) && num(last.at)) out.last = { slug: last.slug, at: last.at };
  const p = raw.prefs as Partial<Preferences & { updatedAt: number }> | undefined;
  if (
    p && num(p.updatedAt) &&
    ['auto', 'paper', 'dusk'].includes(p.theme as string) &&
    ['small', 'standard', 'large', 'larger'].includes(p.fontSize as string) &&
    ['narrow', 'standard', 'wide'].includes(p.measure as string)
  ) {
    out.prefs = { theme: p.theme!, fontSize: p.fontSize!, measure: p.measure!, updatedAt: p.updatedAt };
  }
  if (raw.notes && typeof raw.notes === 'object') {
    for (const [slug, value] of Object.entries(raw.notes as Record<string, unknown>)) {
      const n = value as Partial<Note> | null;
      if (SLUG.test(slug) && n && typeof n.text === 'string' && num(n.updatedAt)) {
        out.notes[slug] = { text: n.text.slice(0, 4000), updatedAt: n.updatedAt };
      }
    }
  }
  return out;
}

function newer<T extends { updatedAt: number }>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

export function mergeVaults(a: VaultData, b: VaultData): VaultData {
  const out = emptyVault();
  for (const slug of new Set([...Object.keys(a.chapters), ...Object.keys(b.chapters)])) {
    const x = a.chapters[slug];
    const y = b.chapters[slug];
    if (!x || !y) {
      out.chapters[slug] = { ...(x ?? y)! };
      continue;
    }
    const winner = x.updatedAt !== y.updatedAt ? (x.updatedAt > y.updatedAt ? x : y) : x.progress >= y.progress ? x : y;
    out.chapters[slug] = {
      progress: winner.progress,
      completed: x.completed || y.completed,
      updatedAt: Math.max(x.updatedAt, y.updatedAt),
    };
  }
  if (a.last || b.last) {
    const [x, y] = [a.last, b.last];
    out.last = !x ? y : !y ? x : x.at !== y.at ? (x.at > y.at ? x : y) : x.slug >= y.slug ? x : y;
  }
  const prefs = newer(a.prefs, b.prefs);
  if (prefs) out.prefs = prefs;
  for (const slug of new Set([...Object.keys(a.notes), ...Object.keys(b.notes)])) {
    out.notes[slug] = newer(a.notes[slug], b.notes[slug])!;
  }
  return out;
}

export function sameVault(a: VaultData, b: VaultData): boolean {
  const canon = (v: VaultData) => JSON.stringify(v, Object.keys(flatten(v)).sort());
  return canon(a) === canon(b);
}

function flatten(value: unknown, acc: Record<string, true> = {}): Record<string, true> {
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      acc[k] = true;
      flatten(v, acc);
    }
  }
  return acc;
}

export function recordProgress(state: VaultData, slug: string, progress: number, now = Date.now()): VaultData {
  const prev = state.chapters[slug];
  const p = clamp01(progress);
  return {
    ...state,
    chapters: {
      ...state.chapters,
      [slug]: { progress: p, completed: (prev?.completed ?? false) || p >= 0.97, updatedAt: now },
    },
    last: { slug, at: now },
  };
}
