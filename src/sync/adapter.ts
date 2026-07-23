import { emptySyncedBlob, type SyncedBlob } from './types';

export interface SyncUser {
  uid: string;
  email: string | null;
  photoURL: string | null;
}

export interface SyncAdapter {
  loadRemote(uid: string): Promise<SyncedBlob | null>;
  saveRemote(uid: string, blob: SyncedBlob): Promise<void>;
  onAuthChange(cb: (user: SyncUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

export interface MockAdapter extends SyncAdapter {
  emitUser(user: SyncUser | null): void;
  remote: SyncedBlob | null;
  saveCount: number;
  loadCount: number;
  failNext(error: Error): void;
}

export function createMockAdapter(initial: { remote?: SyncedBlob | null } = {}): MockAdapter {
  const listeners = new Set<(user: SyncUser | null) => void>();
  let pendingError: Error | null = null;

  function takeError(): Error | null {
    const e = pendingError;
    pendingError = null;
    return e;
  }

  const adapter: MockAdapter = {
    remote: initial.remote ?? null,
    saveCount: 0,
    loadCount: 0,
    failNext(error) { pendingError = error; },
    emitUser(user) { for (const cb of listeners) cb(user); },
    async loadRemote() {
      adapter.loadCount++;
      const e = takeError();
      if (e) throw e;
      return adapter.remote ? structuredClone(adapter.remote) : null;
    },
    async saveRemote(_uid, blob) {
      adapter.saveCount++;
      const e = takeError();
      if (e) throw e;
      adapter.remote = structuredClone(blob);
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    async signIn() {
      adapter.emitUser({ uid: 'mock-uid', email: 'mock@example.com', photoURL: null });
    },
    async signOut() {
      adapter.emitUser(null);
    },
  };

  return adapter;
}

/**
 * With no VITE_FIREBASE_* values present, `getFirebase()` returns null and every
 * method here becomes an inert no-op, so the app behaves exactly as it did
 * before this feature. Missing config must degrade, never crash.
 *
 * `./firebase` is imported dynamically so that merely constructing this adapter
 * — which AuthProvider does on mount — never pulls the SDK into the initial
 * bundle for a signed-out user.
 */
export function createFirebaseAdapter(): SyncAdapter {
  return {
    async loadRemote(uid) {
      const { getFirebase } = await import('./firebase');
      const fb = getFirebase();
      if (!fb) return null;
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(fb.db, 'users', uid));
      if (!snap.exists()) return null;
      const data = snap.data();
      // Unknown wire versions are treated as absent rather than trusted: a
      // future format must not be reinterpreted by an older client.
      if (data.version !== 1) return null;
      return { ...emptySyncedBlob(), ...data } as SyncedBlob;
    },

    async saveRemote(uid, blob) {
      const { getFirebase } = await import('./firebase');
      const fb = getFirebase();
      if (!fb) return;
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      await setDoc(doc(fb.db, 'users', uid), { ...blob, syncedAt: serverTimestamp() });
    },

    onAuthChange(cb) {
      let unsubscribe: (() => void) | null = null;
      let cancelled = false;
      void (async () => {
        const { getFirebase } = await import('./firebase');
        const fb = getFirebase();
        if (!fb || cancelled) return;
        const { onAuthStateChanged } = await import('firebase/auth');
        if (cancelled) return;
        unsubscribe = onAuthStateChanged(fb.auth, (user) => {
          cb(user ? { uid: user.uid, email: user.email, photoURL: user.photoURL } : null);
        });
      })();
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    },

    async signIn() {
      const { getFirebase } = await import('./firebase');
      const fb = getFirebase();
      if (!fb) throw new Error('Cloud sync is not configured on this build.');
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      await signInWithPopup(fb.auth, new GoogleAuthProvider());
    },

    async signOut() {
      const { getFirebase } = await import('./firebase');
      const fb = getFirebase();
      if (!fb) return;
      const { signOut } = await import('firebase/auth');
      await signOut(fb.auth);
    },
  };
}
