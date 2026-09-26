/**
 * Client-side cryptography (Web Crypto only; no custom primitives).
 *
 *   reader key (256-bit CSPRNG, shown to the reader once)
 *     ├─ HKDF-SHA256(info="dusk-shingle/auth/v1")  → authKey   (sent to server; server stores SHA-256(authKey))
 *     └─ HKDF-SHA256(info="dusk-shingle/vault-kek/v1") → KEK   (never leaves the device)
 *            └─ AES-GCM wraps a random 256-bit data key (DEK)
 *                   └─ AES-GCM encrypts the private vault (reading state, preferences, private notes)
 *
 * The server never receives the reader key or the KEK, so it cannot decrypt
 * the vault. HKDF (not a password KDF) is appropriate because the reader key
 * is uniformly random with 256 bits of entropy. See docs/ARCHITECTURE.md.
 */

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();
const HKDF_SALT = enc.encode('dusk-shingle/hkdf-salt/v1');
const VAULT_AAD = enc.encode('dusk-shingle/vault/v1');
const WRAP_AAD = enc.encode('dusk-shingle/dek-wrap/v1');
const KEY_PREFIX = 'dusk1-';

export class VaultCryptoError extends Error {
  constructor(message = 'The encrypted data could not be decrypted with this key.') {
    super(message);
    this.name = 'VaultCryptoError';
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new VaultCryptoError('Malformed encoding.');
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** New reader key: 32 bytes from the platform CSPRNG. */
export function generateReaderKey(): string {
  return KEY_PREFIX + toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

/** Accept a pasted key with stray whitespace; return canonical form or undefined. */
export function normalizeReaderKey(input: string): string | undefined {
  const compact = input.replace(/\s+/g, '');
  const body = compact.startsWith(KEY_PREFIX) ? compact.slice(KEY_PREFIX.length) : compact;
  if (!/^[A-Za-z0-9_-]{43}$/.test(body)) return undefined;
  if (fromBase64Url(body).length !== 32) return undefined;
  return KEY_PREFIX + body;
}

async function hkdfBase(readerKey: string): Promise<CryptoKey> {
  const canonical = normalizeReaderKey(readerKey);
  if (!canonical) throw new VaultCryptoError('That is not a valid reader key.');
  const raw = fromBase64Url(canonical.slice(KEY_PREFIX.length));
  return subtle().importKey('raw', raw as BufferSource, 'HKDF', false, ['deriveBits', 'deriveKey']);
}

export type DerivedKeys = { authKey: string; kek: CryptoKey };

export async function deriveKeys(readerKey: string): Promise<DerivedKeys> {
  const base = await hkdfBase(readerKey);
  const authBits = await subtle().deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: enc.encode('dusk-shingle/auth/v1') },
    base,
    256,
  );
  const kek = await subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: enc.encode('dusk-shingle/vault-kek/v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
  return { authKey: toBase64Url(new Uint8Array(authBits)), kek };
}

/** Random data key. Extractable only so it can be wrapped once; stored copies are non-extractable. */
export async function generateDataKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapDataKey(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle().wrapKey('raw', dek, kek, { name: 'AES-GCM', iv, additionalData: WRAP_AAD });
  return toBase64Url(concat(iv, new Uint8Array(wrapped)));
}

export async function unwrapDataKey(wrapped: string, kek: CryptoKey): Promise<CryptoKey> {
  try {
    const bytes = fromBase64Url(wrapped);
    if (bytes.length < 12 + 32 + 16) throw new VaultCryptoError();
    return await subtle().unwrapKey(
      'raw',
      bytes.slice(12) as BufferSource,
      kek,
      { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: WRAP_AAD },
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } catch {
    throw new VaultCryptoError();
  }
}

export async function encryptJson(dek: CryptoKey, value: unknown): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: VAULT_AAD }, dek, enc.encode(JSON.stringify(value)));
  return toBase64Url(concat(iv, new Uint8Array(ct)));
}

/** Authenticated decryption: any tampering, truncation or wrong key throws — never returns partial data. */
export async function decryptJson<T = unknown>(dek: CryptoKey, ciphertext: string): Promise<T> {
  try {
    const bytes = fromBase64Url(ciphertext);
    if (bytes.length < 12 + 16) throw new VaultCryptoError();
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: VAULT_AAD }, dek, bytes.slice(12) as BufferSource);
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    throw new VaultCryptoError();
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
