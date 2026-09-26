import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiFailure } from './api';
import {
  VaultCryptoError, decryptJson, deriveKeys, encryptJson, generateDataKey, generateReaderKey, normalizeReaderKey, unwrapDataKey, wrapDataKey,
} from './crypto';
import { clearDataKey, loadDataKey, saveDataKey } from './keystore';
import {
  defaultPreferences, emptyVault, mergeVaults, recordProgress as record, sameVault, sanitizeVault,
  type Preferences, type VaultData,
} from './readerState';

export type Account = { handle: string; role: 'reader' | 'moderator' };
export type AccountStatus = 'loading' | 'signed-out' | 'signed-in' | 'unavailable';
export type SyncStatus = 'local' | 'saving' | 'synced' | 'offline' | 'locked' | 'crypto-error' | 'error';

type VaultEnvelope = { version: number; wrappedKey: string; ciphertext: string };
type SyncMeta = { version: number; dirty: boolean; wrappedKey?: string };

const VAULT_KEY = 'dusk.vault';
const META_KEY = 'dusk.sync';
const LEGACY_PREFS = 'dusk-shingle-reading-preferences';

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the reader still works for this visit */
  }
}

function initialVault(): VaultData {
  const stored = readJson<unknown>(VAULT_KEY);
  if (stored) return sanitizeVault(stored);
  const legacy = readJson<{ theme?: string; fontSize?: string; width?: string }>(LEGACY_PREFS);
  const vault = emptyVault();
  if (legacy) {
    vault.prefs = {
      theme: legacy.theme === 'night' ? 'dusk' : legacy.theme === 'paper' ? 'paper' : 'auto',
      fontSize: legacy.fontSize === 'large' ? 'large' : 'standard',
      measure: legacy.width === 'wide' ? 'wide' : 'standard',
      updatedAt: 0,
    };
  }
  return vault;
}

type ReaderContextValue = {
  account: Account | null;
  accountStatus: AccountStatus;
  accountMessage?: string;
  sync: SyncStatus;
  vault: VaultData;
  prefs: Preferences;
  completedSlugs: string[];
  unreadReplies: number;
  setUnreadReplies: (n: number) => void;
  recordProgress: (slug: string, progress: number) => void;
  setPrefs: (update: Partial<Preferences>) => void;
  setNote: (slug: string, text: string) => void;
  createAccount: () => Promise<string>;
  signIn: (readerKey: string) => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<void>;
  deleteAccount: (phrase: string) => Promise<void>;
  syncNow: () => Promise<void>;
  refreshAccount: () => Promise<void>;
};

const ReaderContext = createContext<ReaderContextValue | null>(null);

export function ReaderProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('loading');
  const [accountMessage, setAccountMessage] = useState<string>();
  const [vault, setVault] = useState<VaultData>(initialVault);
  const [sync, setSync] = useState<SyncStatus>('local');
  const [unreadReplies, setUnreadReplies] = useState(0);
  const vaultRef = useRef(vault);
  const metaRef = useRef<SyncMeta>(readJson<SyncMeta>(META_KEY) ?? { version: 0, dirty: false });
  const syncing = useRef<Promise<void> | null>(null);
  const timer = useRef<number>();

  const commitVault = useCallback((next: VaultData) => {
    vaultRef.current = next;
    setVault(next);
    writeJson(VAULT_KEY, next);
  }, []);
  const commitMeta = useCallback((next: Partial<SyncMeta>) => {
    metaRef.current = { ...metaRef.current, ...next };
    writeJson(META_KEY, metaRef.current);
  }, []);

  const clearDevice = useCallback(async () => {
    await clearDataKey();
    try {
      localStorage.removeItem(VAULT_KEY);
      localStorage.removeItem(META_KEY);
      localStorage.removeItem(LEGACY_PREFS);
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    metaRef.current = { version: 0, dirty: false };
    // Keep only appearance preferences so signing out does not flash a different theme.
    const kept = emptyVault();
    if (vaultRef.current.prefs) kept.prefs = vaultRef.current.prefs;
    commitVault(kept);
  }, [commitVault]);

  /** Pull → decrypt → merge → encrypt → push with optimistic concurrency. */
  const runSync = useCallback(async () => {
    const dek = await loadDataKey();
    if (!dek) {
      setSync('locked');
      return;
    }
    if (!navigator.onLine) {
      setSync('offline');
      return;
    }
    setSync('saving');
    try {
      let remote = (await api<{ vault: VaultEnvelope | null }>('GET', '/api/vault')).vault;
      for (let attempt = 0; attempt < 4; attempt++) {
        const remoteData = remote ? sanitizeVault(await decryptJson(dek, remote.ciphertext)) : emptyVault();
        const merged = mergeVaults(vaultRef.current, remoteData);
        commitVault(merged);
        const wrappedKey = remote?.wrappedKey ?? metaRef.current.wrappedKey;
        if (!wrappedKey) throw new VaultCryptoError('Missing wrapped key.');
        if (remote && sameVault(merged, remoteData)) {
          commitMeta({ version: remote.version, dirty: false, wrappedKey });
          setSync('synced');
          return;
        }
        try {
          const { version } = await api<{ version: number }>('PUT', '/api/vault', {
            baseVersion: remote?.version ?? 0,
            wrappedKey,
            ciphertext: await encryptJson(dek, merged),
          });
          commitMeta({ version, dirty: false, wrappedKey });
          setSync('synced');
          return;
        } catch (error) {
          if (error instanceof ApiFailure && error.status === 409) {
            remote = (error.extra.vault as VaultEnvelope | null) ?? null; // another device wrote first: merge again
            continue;
          }
          throw error;
        }
      }
      setSync('error');
    } catch (error) {
      if (error instanceof VaultCryptoError) setSync('crypto-error');
      else if (error instanceof ApiFailure && error.status === 401) {
        setAccount(null);
        setAccountStatus('signed-out');
        setSync('local');
      } else if (error instanceof ApiFailure && error.code === 'offline') setSync('offline');
      else setSync('error');
    }
  }, [commitMeta, commitVault]);

  const syncNow = useCallback(async () => {
    if (syncing.current) return syncing.current;
    syncing.current = runSync().finally(() => {
      syncing.current = null;
    });
    return syncing.current;
  }, [runSync]);

  const scheduleSync = useCallback(() => {
    commitMeta({ dirty: true });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void syncNow(), 4000);
  }, [commitMeta, syncNow]);

  const refreshAccount = useCallback(async () => {
    try {
      const { account: a } = await api<{ account: Account | null }>('GET', '/api/me');
      setAccount(a);
      setAccountStatus(a ? 'signed-in' : 'signed-out');
      setAccountMessage(undefined);
      if (a) {
        void syncNow();
        api<{ replies: { unread: boolean }[] }>('GET', '/api/notifications')
          .then((n) => setUnreadReplies(n.replies.filter((r) => r.unread).length))
          .catch(() => undefined);
      }
    } catch (error) {
      setAccount(null);
      if (error instanceof ApiFailure && ['not_configured', 'db_unavailable', 'not_deployed', 'offline', 'server'].includes(error.code)) {
        setAccountStatus('unavailable');
        setAccountMessage(error.message);
      } else setAccountStatus('signed-out');
    }
  }, [syncNow]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    if (accountStatus !== 'signed-in') return;
    const onVisible = () => document.visibilityState === 'visible' && void syncNow();
    const onOnline = () => void syncNow();
    const onOffline = () => setSync('offline');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [accountStatus, syncNow]);

  const mutate = useCallback(
    (fn: (v: VaultData) => VaultData) => {
      commitVault(fn(vaultRef.current));
      if (accountStatus === 'signed-in') scheduleSync();
    },
    [accountStatus, commitVault, scheduleSync],
  );

  /** Establish keys on this device after the server accepted the auth key. */
  const establishVault = useCallback(async (readerKey: string) => {
    const { kek } = await deriveKeys(readerKey);
    const existing = (await api<{ vault: VaultEnvelope | null }>('GET', '/api/vault')).vault;
    let wrappedKey: string;
    if (existing) {
      wrappedKey = existing.wrappedKey;
    } else {
      wrappedKey = await wrapDataKey(await generateDataKey(), kek);
    }
    // Re-import through unwrap so the stored copy is non-extractable.
    const dek = await unwrapDataKey(wrappedKey, kek);
    await saveDataKey(dek);
    commitMeta({ wrappedKey, version: existing?.version ?? 0, dirty: true });
  }, [commitMeta]);

  const createAccount = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const readerKey = generateReaderKey();
      const { authKey } = await deriveKeys(readerKey);
      try {
        const a = await api<Account>('POST', '/api/account', { authKey });
        await establishVault(readerKey);
        setAccount(a);
        setAccountStatus('signed-in');
        await syncNow();
        return readerKey;
      } catch (error) {
        if (error instanceof ApiFailure && error.code === 'key_collision') continue;
        throw error;
      }
    }
    throw new ApiFailure(503, 'busy', 'We could not create an account just now. Please try again.');
  }, [establishVault, syncNow]);

  const signIn = useCallback(async (input: string) => {
    const readerKey = normalizeReaderKey(input);
    if (!readerKey) throw new ApiFailure(400, 'bad_key', 'That doesn’t look like a reader key. Keys begin with “dusk1-” followed by 43 characters.');
    const { authKey } = await deriveKeys(readerKey);
    const a = await api<Account>('POST', '/api/session', { authKey });
    setAccount(a);
    setAccountStatus('signed-in');
    try {
      await establishVault(readerKey);
      await syncNow();
    } catch (error) {
      setSync(error instanceof VaultCryptoError ? 'crypto-error' : 'error');
    }
  }, [establishVault, syncNow]);

  const signOut = useCallback(async (everywhere = false) => {
    window.clearTimeout(timer.current);
    if (metaRef.current.dirty) await syncNow().catch(() => undefined);
    await api('DELETE', everywhere ? '/api/sessions' : '/api/session').catch(() => undefined);
    await clearDevice();
    setAccount(null);
    setAccountStatus('signed-out');
    setSync('local');
    setUnreadReplies(0);
  }, [clearDevice, syncNow]);

  const deleteAccount = useCallback(async (phrase: string) => {
    await api('DELETE', '/api/account', { confirm: phrase });
    window.clearTimeout(timer.current);
    await clearDevice();
    setAccount(null);
    setAccountStatus('signed-out');
    setSync('local');
    setUnreadReplies(0);
  }, [clearDevice]);

  const value = useMemo<ReaderContextValue>(() => {
    const { updatedAt: _ignored, ...prefs } = vault.prefs ?? { ...defaultPreferences, updatedAt: 0 };
    void _ignored;
    return {
      account, accountStatus, accountMessage, sync, vault, prefs, unreadReplies, setUnreadReplies,
      completedSlugs: Object.entries(vault.chapters).filter(([, c]) => c.completed).map(([s]) => s),
      recordProgress: (slug, progress) => mutate((v) => record(v, slug, progress)),
      setPrefs: (update) => mutate((v) => ({ ...v, prefs: { ...defaultPreferences, ...v.prefs, ...update, updatedAt: Date.now() } })),
      setNote: (slug, text) => mutate((v) => ({ ...v, notes: { ...v.notes, [slug]: { text: text.slice(0, 4000), updatedAt: Date.now() } } })),
      createAccount, signIn, signOut, deleteAccount, syncNow, refreshAccount,
    };
  }, [account, accountMessage, accountStatus, createAccount, deleteAccount, mutate, refreshAccount, signIn, signOut, sync, syncNow, unreadReplies, vault]);

  return <ReaderContext.Provider value={value}>{children}</ReaderContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useReader(): ReaderContextValue {
  const ctx = useContext(ReaderContext);
  if (!ctx) throw new Error('useReader must be used inside ReaderProvider');
  return ctx;
}
