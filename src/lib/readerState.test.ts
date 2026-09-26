import { describe, expect, it } from 'vitest';
import { emptyVault, mergeVaults, recordProgress, sanitizeVault, type VaultData } from './readerState';

const a = recordProgress(emptyVault(), 'the-dry-pump', 0.3, 1000);
const b = recordProgress(emptyVault(), 'the-dry-pump', 0.6, 2000);

describe('reading-state merge', () => {
  it('keeps the newer position rather than overwriting with stale state', () => {
    expect(mergeVaults(a, b).chapters['the-dry-pump'].progress).toBe(0.6);
    expect(mergeVaults(b, a).chapters['the-dry-pump'].progress).toBe(0.6);
  });
  it('is commutative, associative and idempotent', () => {
    const c: VaultData = { ...recordProgress(emptyVault(), 'ch-two', 0.1, 1500), notes: { 'the-dry-pump': { text: 'n', updatedAt: 5 } } };
    const s = (v: VaultData) => JSON.stringify(v, Object.keys(v).sort());
    expect(s(mergeVaults(a, b))).toBe(s(mergeVaults(b, a)));
    expect(JSON.stringify(mergeVaults(mergeVaults(a, b), c))).toBe(JSON.stringify(mergeVaults(a, mergeVaults(b, c))));
    expect(mergeVaults(a, a)).toEqual(a);
  });
  it('keeps completion sticky across devices even when another device rereads', () => {
    const done = recordProgress(emptyVault(), 'the-dry-pump', 1, 1000);
    const reread = recordProgress(emptyVault(), 'the-dry-pump', 0.05, 3000);
    const merged = mergeVaults(done, reread);
    expect(merged.chapters['the-dry-pump']).toMatchObject({ completed: true, progress: 0.05 });
  });
  it('resolves exact timestamp ties deterministically', () => {
    const x = recordProgress(emptyVault(), 'the-dry-pump', 0.2, 1000);
    const y = recordProgress(emptyVault(), 'the-dry-pump', 0.8, 1000);
    expect(mergeVaults(x, y)).toEqual(mergeVaults(y, x));
  });
  it('drops corrupted or hostile fields when sanitising', () => {
    const v = sanitizeVault({
      chapters: { 'the-dry-pump': { progress: 7, completed: false, updatedAt: 1 }, '<script>': { progress: 0.1, completed: false, updatedAt: 1 }, bad: { progress: 'x' } },
      last: { slug: '../etc', at: 1 },
      prefs: { theme: 'neon', fontSize: 'standard', measure: 'standard', updatedAt: 1 },
      notes: { ok: { text: 'y'.repeat(5000), updatedAt: 2 } },
    });
    expect(v.chapters['the-dry-pump'].progress).toBe(1);
    expect(Object.keys(v.chapters)).toEqual(['the-dry-pump']);
    expect(v.last).toBeUndefined();
    expect(v.prefs).toBeUndefined();
    expect(v.notes.ok.text).toHaveLength(4000);
    expect(sanitizeVault(null)).toEqual(emptyVault());
  });
});
