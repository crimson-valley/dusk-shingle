/**
 * Stores the vault data key as a NON-EXTRACTABLE CryptoKey in IndexedDB.
 * Page scripts can use it to encrypt/decrypt but cannot read its bytes.
 * The reader key itself is never persisted by the app.
 */
const DB = 'dusk-shingle-keys';
const STORE = 'keys';
const ID = 'vault-dek';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const loadDataKey = () => run<CryptoKey | undefined>('readonly', (s) => s.get(ID)).catch(() => undefined);
export const saveDataKey = (key: CryptoKey) => run<void>('readwrite', (s) => s.put(key, ID));
export const clearDataKey = () => run<void>('readwrite', (s) => s.delete(ID)).catch(() => undefined);
