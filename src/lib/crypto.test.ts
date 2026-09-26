import { describe, expect, it } from 'vitest';
import {
  VaultCryptoError, decryptJson, deriveKeys, encryptJson, fromBase64Url, generateDataKey,
  generateReaderKey, normalizeReaderKey, toBase64Url, unwrapDataKey, wrapDataKey,
} from './crypto';

describe('reader key', () => {
  it('is 256 bits from the CSPRNG and never repeats', () => {
    const keys = new Set(Array.from({ length: 500 }, generateReaderKey));
    expect(keys.size).toBe(500);
    for (const k of keys) expect(fromBase64Url(k.slice(6))).toHaveLength(32);
  });
  it('normalises pasted keys and rejects malformed ones', () => {
    const k = generateReaderKey();
    expect(normalizeReaderKey(`  ${k.slice(0, 20)} \n ${k.slice(20)} `)).toBe(k);
    expect(normalizeReaderKey(k.slice(6))).toBe(k);
    expect(normalizeReaderKey('dusk1-short')).toBeUndefined();
    expect(normalizeReaderKey(k + 'x')).toBeUndefined();
  });
});

describe('key separation', () => {
  it('derives an auth key unrelated to the reader key and deterministic per key', async () => {
    const k = generateReaderKey();
    const a = await deriveKeys(k);
    const b = await deriveKeys(k);
    expect(a.authKey).toBe(b.authKey);
    expect(a.authKey).not.toContain(k.slice(6));
    expect(a.authKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await deriveKeys(generateReaderKey())).authKey).not.toBe(a.authKey);
  });
  it('makes the KEK non-extractable and unusable for anything but wrapping', async () => {
    const { kek } = await deriveKeys(generateReaderKey());
    expect(kek.extractable).toBe(false);
    expect(kek.usages.sort()).toEqual(['unwrapKey', 'wrapKey']);
    await expect(crypto.subtle.exportKey('raw', kek)).rejects.toThrow();
  });
});

describe('vault encryption', () => {
  it('round-trips through wrap → unwrap → encrypt → decrypt', async () => {
    const { kek } = await deriveKeys(generateReaderKey());
    const dek = await generateDataKey();
    const wrapped = await wrapDataKey(dek, kek);
    const restored = await unwrapDataKey(wrapped, kek);
    expect(restored.extractable).toBe(false);
    const ct = await encryptJson(dek, { chapters: { 'the-dry-pump': 0.4 }, note: 'private' });
    expect(ct).not.toContain('private');
    expect(await decryptJson(restored, ct)).toEqual({ chapters: { 'the-dry-pump': 0.4 }, note: 'private' });
  });
  it('uses a fresh IV per encryption', async () => {
    const dek = await generateDataKey();
    expect(await encryptJson(dek, 1)).not.toBe(await encryptJson(dek, 1));
  });
  it('fails safely with the wrong reader key', async () => {
    const dek = await generateDataKey();
    const wrapped = await wrapDataKey(dek, (await deriveKeys(generateReaderKey())).kek);
    await expect(unwrapDataKey(wrapped, (await deriveKeys(generateReaderKey())).kek)).rejects.toBeInstanceOf(VaultCryptoError);
  });
  it('fails safely with the wrong data key', async () => {
    const ct = await encryptJson(await generateDataKey(), { a: 1 });
    await expect(decryptJson(await generateDataKey(), ct)).rejects.toBeInstanceOf(VaultCryptoError);
  });
  it('rejects corrupted, truncated and malformed ciphertext without partial output', async () => {
    const dek = await generateDataKey();
    const bytes = fromBase64Url(await encryptJson(dek, { text: 'x'.repeat(100) }));
    for (const i of [0, 12, 40, bytes.length - 1]) {
      const flipped = bytes.slice();
      flipped[i] ^= 1;
      await expect(decryptJson(dek, toBase64Url(flipped))).rejects.toBeInstanceOf(VaultCryptoError);
    }
    await expect(decryptJson(dek, toBase64Url(bytes.slice(0, 20)))).rejects.toBeInstanceOf(VaultCryptoError);
    await expect(decryptJson(dek, '!!not base64!!')).rejects.toBeInstanceOf(VaultCryptoError);
    await expect(unwrapDataKey('AAAA', (await deriveKeys(generateReaderKey())).kek)).rejects.toBeInstanceOf(VaultCryptoError);
  });
});
