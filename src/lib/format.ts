export const chapterNumber = (n: number) => String(n).padStart(2, '0');

export function relativeTime(iso: string | Date): string {
  const then = new Date(iso).getTime();
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 230));
