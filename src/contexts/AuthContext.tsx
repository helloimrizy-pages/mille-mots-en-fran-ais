import {
  createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { useFlashcardState } from '../flashcards/useFlashcardState';
import { subscribeReset } from './FlashcardContext';
import { loadPlaySettings, savePlaySettings, subscribePlaySettings } from '../play/playStorage';
import { createFirebaseAdapter, type SyncAdapter, type SyncUser } from '../sync/adapter';
import { mergeBlobs } from '../sync/merge';
import { loadSyncMeta, saveSyncMeta } from '../sync/syncMeta';
import { SYNC_VERSION, emptySyncedBlob, type SyncStatus, type SyncedBlob } from '../sync/types';
import type { StoredBlob } from '../flashcards/types';

export interface SyncApi {
  user: SyncUser | null;
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components -- context object, not a component; consumed via useSyncState
export const SyncContext = createContext<SyncApi | null>(null);

const PUSH_DEBOUNCE_MS = 250;

interface Props {
  children: ReactNode;
  /** Injected by tests so the suite never initialises Firebase. */
  adapter?: SyncAdapter;
}

export function AuthProvider({ children, adapter: injected }: Props) {
  const api = useFlashcardState();
  const adapter = useMemo(() => injected ?? createFirebaseAdapter(), [injected]);

  const [user, setUser] = useState<SyncUser | null>(null);
  const [status, setStatus] = useState<SyncStatus>('signed-out');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => loadSyncMeta().lastSyncedAt);
  const [error, setError] = useState<string | null>(null);

  // Read through refs inside the sync routine so it never goes stale and never
  // needs to be a dependency of the effects that schedule it. Synced from an
  // effect (not assigned during render) so refs stay outside render, and
  // declared first so any other effect in this same commit already sees the
  // up-to-date value.
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; });
  const userRef = useRef<SyncUser | null>(null);
  useEffect(() => { userRef.current = user; });

  // Serialises every sync so a debounced push can never overtake an in-flight
  // pull-merge and write a blob assembled from pre-merge state.
  const chain = useRef<Promise<void>>(Promise.resolve());

  const assembleLocal = useCallback((): SyncedBlob => {
    const meta = loadSyncMeta();
    const blob = apiRef.current.getBlob();
    return {
      version: SYNC_VERSION,
      epoch: meta.epoch,
      cards: blob.cards,
      settings: blob.settings,
      settingsUpdatedAt: meta.settingsUpdatedAt,
      play: loadPlaySettings(),
      playUpdatedAt: meta.playUpdatedAt,
    };
  }, []);

  const applyLocal = useCallback((next: SyncedBlob) => {
    const current = apiRef.current.getBlob();
    const merged: StoredBlob = {
      ...current,
      cards: next.cards,
      settings: next.settings,
    };
    apiRef.current.replaceBlob(merged);
    savePlaySettings(next.play);
  }, []);

  const runSync = useCallback((uid: string, mode: 'full' | 'push') => {
    const task = async () => {
      setStatus('syncing');
      setError(null);
      try {
        const meta = loadSyncMeta();
        const local = assembleLocal();

        let next: SyncedBlob;
        if (mode === 'push') {
          next = local;
        } else {
          const remote = await adapter.loadRemote(uid);
          // A different account on this browser must never inherit the previous
          // user's cards, so adopt the remote wholesale instead of merging.
          const switchingAccounts = meta.lastUid !== null && meta.lastUid !== uid;
          next = switchingAccounts
            ? (remote ?? emptySyncedBlob())
            : mergeBlobs(local, remote).blob;
        }

        applyLocal(next);
        await adapter.saveRemote(uid, next);

        const now = Date.now();
        saveSyncMeta({
          version: 1,
          lastUid: uid,
          epoch: next.epoch,
          settingsUpdatedAt: next.settingsUpdatedAt,
          playUpdatedAt: next.playUpdatedAt,
          lastSyncedAt: now,
        });
        setLastSyncedAt(now);
        setStatus('synced');
      } catch (e) {
        // Never fatal: local storage keeps working exactly as it does signed out.
        setError(e instanceof Error ? e.message : String(e));
        setStatus(navigator.onLine === false ? 'offline' : 'error');
      }
    };

    chain.current = chain.current.then(task, task);
    return chain.current;
  }, [adapter, assembleLocal, applyLocal]);

  useEffect(() => {
    return adapter.onAuthChange((next) => {
      setUser(next);
      if (next) {
        void runSync(next.uid, 'full');
      } else {
        setStatus('signed-out');
        setError(null);
      }
    });
  }, [adapter, runSync]);

  // Set by the reset listener below and consumed here, never the reverse: the
  // listener fires synchronously inside resetAll(), before React has
  // re-rendered with the cleared blob, so apiRef.current is still stale at
  // that instant. This effect only runs after commit, so by the time it reads
  // the flag the ref is guaranteed fresh, and the push it fires carries the
  // cleared cards instead of the ones the reset just wiped.
  const pendingResetPush = useRef(false);

  // Push after changes settle. Skipped entirely while signed out.
  const blob = api.getBlob();
  useEffect(() => {
    if (!userRef.current) return;
    const uid = userRef.current.uid;
    if (pendingResetPush.current) {
      pendingResetPush.current = false;
      void runSync(uid, 'push');
      return;
    }
    const timer = setTimeout(() => { void runSync(uid, 'push'); }, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [blob, runSync]);

  useEffect(() => {
    return subscribePlaySettings(() => {
      if (!userRef.current) return;
      saveSyncMeta({ ...loadSyncMeta(), playUpdatedAt: Date.now() });
    });
  }, []);

  // Stamp settings changes so the merge can tell local settings are newer.
  // Without this the timestamp stays 0 forever and remote settings always win.
  // Skips the first run, which is mount rather than an edit.
  const settingsSeen = useRef(false);
  useEffect(() => {
    if (!settingsSeen.current) { settingsSeen.current = true; return; }
    if (!userRef.current) return;
    saveSyncMeta({ ...loadSyncMeta(), settingsUpdatedAt: Date.now() });
  }, [api.settings]);

  // A reset must win over every other device's copy, or the merge — which
  // never deletes — restores the cards it just cleared. Bumping the epoch is
  // what makes the clear authoritative; the flag defers the actual push to
  // the blob effect above so it reads the post-reset ref, not this instant's.
  useEffect(() => {
    return subscribeReset(() => {
      const meta = loadSyncMeta();
      saveSyncMeta({ ...meta, epoch: meta.epoch + 1 });
      if (userRef.current) pendingResetPush.current = true;
    });
  }, []);

  // Returning to the tab is the cheapest signal that another device may have
  // written while this one was in the background.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      if (!userRef.current) return;
      void runSync(userRef.current.uid, 'full');
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [runSync]);

  const signIn = useCallback(async () => {
    try {
      await adapter.signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [adapter]);

  const signOut = useCallback(async () => {
    try {
      await adapter.signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [adapter]);

  const syncNow = useCallback(async () => {
    const current = userRef.current;
    if (!current) return;
    await runSync(current.uid, 'full');
  }, [runSync]);

  const value = useMemo<SyncApi>(
    () => ({ user, status, lastSyncedAt, error, signIn, signOut, syncNow }),
    [user, status, lastSyncedAt, error, signIn, signOut, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
