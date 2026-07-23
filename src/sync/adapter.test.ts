import { describe, expect, it } from 'vitest';
import { createFirebaseAdapter, createMockAdapter } from './adapter';
import { emptySyncedBlob } from './types';

describe('createMockAdapter', () => {
  it('starts with no remote unless given one', async () => {
    const adapter = createMockAdapter();
    expect(await adapter.loadRemote('uid')).toBeNull();
  });

  it('returns the seeded remote', async () => {
    const seeded = { ...emptySyncedBlob(), epoch: 4 };
    const adapter = createMockAdapter({ remote: seeded });
    expect((await adapter.loadRemote('uid'))?.epoch).toBe(4);
  });

  it('records saves and serves them back', async () => {
    const adapter = createMockAdapter();
    await adapter.saveRemote('uid', { ...emptySyncedBlob(), epoch: 2 });
    expect(adapter.saveCount).toBe(1);
    expect((await adapter.loadRemote('uid'))?.epoch).toBe(2);
  });

  it('counts loads', async () => {
    const adapter = createMockAdapter();
    await adapter.loadRemote('uid');
    await adapter.loadRemote('uid');
    expect(adapter.loadCount).toBe(2);
  });

  it('emits auth changes to subscribers until unsubscribed', () => {
    const adapter = createMockAdapter();
    const seen: (string | null)[] = [];
    const unsubscribe = adapter.onAuthChange((u) => seen.push(u?.uid ?? null));
    adapter.emitUser({ uid: 'a', email: 'a@example.com', photoURL: null });
    adapter.emitUser(null);
    unsubscribe();
    adapter.emitUser({ uid: 'b', email: null, photoURL: null });
    expect(seen).toEqual(['a', null]);
  });

  it('fails exactly one operation after failNext', async () => {
    const adapter = createMockAdapter();
    adapter.failNext(new Error('offline'));
    await expect(adapter.loadRemote('uid')).rejects.toThrow('offline');
    await expect(adapter.loadRemote('uid')).resolves.toBeNull();
  });

  it('does not mutate the callers blob on save', async () => {
    const adapter = createMockAdapter();
    const blob = { ...emptySyncedBlob(), epoch: 1 };
    await adapter.saveRemote('uid', blob);
    blob.epoch = 99;
    expect((await adapter.loadRemote('uid'))?.epoch).toBe(1);
  });

  it('signIn emits a user and signOut emits null', async () => {
    const adapter = createMockAdapter();
    const seen: (string | null)[] = [];
    adapter.onAuthChange((u) => seen.push(u?.uid ?? null));
    await adapter.signIn();
    await adapter.signOut();
    expect(seen.length).toBe(2);
    expect(seen[0]).toBeTruthy();
    expect(seen[1]).toBeNull();
  });
});

describe('firebase module', () => {
  it('is safe to import with no config, and reports itself unconfigured', async () => {
    // The test environment has no VITE_FIREBASE_* values. Importing must not
    // throw and getFirebase() must return null — that is what makes a missing
    // config degrade to local-only rather than crashing the app on mount.
    const mod = await import('./firebase');
    expect(mod.firebaseConfigured).toBe(false);
    expect(mod.getFirebase()).toBeNull();
  });

  it('leaves the real adapter inert when unconfigured', async () => {
    const adapter = createFirebaseAdapter();
    await expect(adapter.loadRemote('uid')).resolves.toBeNull();
    await expect(adapter.saveRemote('uid', emptySyncedBlob())).resolves.toBeUndefined();
    await expect(adapter.signIn()).rejects.toThrow(/not configured/i);
  });
});
