import { act, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { FlashcardProvider } from './FlashcardContext';
import { useFlashcardState } from '../flashcards/useFlashcardState';
import { AuthProvider } from './AuthContext';
import { useSyncState } from '../sync/useSyncState';
import { createMockAdapter, type MockAdapter } from '../sync/adapter';
import { emptySyncedBlob } from '../sync/types';
import { SYNC_META_KEY } from '../sync/syncMeta';
import type { CardState } from '../flashcards/types';

const USER = { uid: 'uid-1', email: 'a@example.com', photoURL: null };
const OTHER = { uid: 'uid-2', email: 'b@example.com', photoURL: null };

function card(overrides: Partial<CardState> = {}): CardState {
  return {
    wordId: 1, direction: 'fr-en',
    stability: 10, difficulty: 5,
    elapsedDays: 0, scheduledDays: 10, reps: 2, lapses: 0,
    state: 'review',
    lastReview: '2026-07-01T00:00:00.000Z',
    due: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

let adapter: MockAdapter;

beforeEach(() => {
  localStorage.clear();
  adapter = createMockAdapter();
});

afterEach(() => localStorage.clear());

function wrapper({ children }: { children: ReactNode }) {
  return (
    <FlashcardProvider>
      <AuthProvider adapter={adapter}>{children}</AuthProvider>
    </FlashcardProvider>
  );
}

function renderBoth() {
  return renderHook(() => ({ sync: useSyncState(), cards: useFlashcardState() }), { wrapper });
}

describe('AuthProvider', () => {
  it('starts signed out', () => {
    const { result } = renderBoth();
    expect(result.current.sync.user).toBeNull();
    expect(result.current.sync.status).toBe('signed-out');
  });

  it('pulls, merges and pushes on sign-in', async () => {
    adapter.remote = { ...emptySyncedBlob(), cards: { '2:fr-en': card({ wordId: 2 }) } };
    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });

    await act(async () => { adapter.emitUser(USER); });

    await waitFor(() => expect(result.current.sync.status).toBe('synced'));
    expect(result.current.cards.cards['1:fr-en']).toBeDefined();
    expect(result.current.cards.cards['2:fr-en']).toBeDefined();
    expect(adapter.saveCount).toBeGreaterThanOrEqual(1);
    expect(Object.keys(adapter.remote!.cards).sort()).toEqual(['1:fr-en', '2:fr-en']);
  });

  it('records the signed-in uid so a later sign-in merges', async () => {
    const { result } = renderBoth();
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));
    expect(localStorage.getItem(SYNC_META_KEY)).toContain('uid-1');
  });

  it('replaces rather than merges when a different account signs in', async () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({
      version: 1, lastUid: 'uid-1', epoch: 0,
      settingsUpdatedAt: 0, playUpdatedAt: 0, lastSyncedAt: 1,
    }));
    adapter.remote = { ...emptySyncedBlob(), cards: { '9:fr-en': card({ wordId: 9 }) } };

    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });

    await act(async () => { adapter.emitUser(OTHER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    expect(result.current.cards.cards['1:fr-en']).toBeUndefined();
    expect(result.current.cards.cards['9:fr-en']).toBeDefined();
  });

  it('sets an error status when the pull fails, leaving local data intact', async () => {
    adapter.failNext(new Error('network down'));
    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });

    await act(async () => { adapter.emitUser(USER); });

    await waitFor(() => expect(result.current.sync.status).toBe('error'));
    expect(result.current.sync.error).toContain('network down');
    expect(result.current.cards.cards['1:fr-en']).toBeDefined();
  });

  it('clears user and status on sign-out but keeps local data', async () => {
    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    await act(async () => { adapter.emitUser(null); });

    expect(result.current.sync.user).toBeNull();
    expect(result.current.sync.status).toBe('signed-out');
    expect(result.current.cards.cards['1:fr-en']).toBeDefined();
  });

  it('syncNow pushes local changes to the remote', async () => {
    const { result } = renderBoth();
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    act(() => { result.current.cards.grade(5, 'fr-en', 3); });
    await act(async () => { await result.current.sync.syncNow(); });

    expect(adapter.remote!.cards['5:fr-en']).toBeDefined();
  });

  it('does not touch the adapter while signed out', async () => {
    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });
    await act(async () => { await result.current.sync.syncNow(); });
    expect(adapter.loadCount).toBe(0);
    expect(adapter.saveCount).toBe(0);
  });

  it('bumps the epoch on reset so the cleared state wins the next merge', async () => {
    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));
    const before = JSON.parse(localStorage.getItem(SYNC_META_KEY)!).epoch;

    await act(async () => { result.current.cards.resetAll(); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    const after = JSON.parse(localStorage.getItem(SYNC_META_KEY)!).epoch;
    expect(after).toBe(before + 1);
    // The push must carry the cleared cards, not restore them.
    expect(adapter.remote!.cards).toEqual({});
    expect(adapter.remote!.epoch).toBe(after);
  });

  it('stamps settingsUpdatedAt when settings change while signed in', async () => {
    const { result } = renderBoth();
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));
    expect(JSON.parse(localStorage.getItem(SYNC_META_KEY)!).settingsUpdatedAt).toBe(0);

    await act(async () => { result.current.cards.updateSettings({ typedCheck: true }); });

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(SYNC_META_KEY)!).settingsUpdatedAt).toBeGreaterThan(0);
    });
  });

  it('settles after signing in — the debounced push does not loop', async () => {
    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    // Let any debounced push fire and settle.
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    const settled = adapter.saveCount;
    // No further syncs should occur without a real change.
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(adapter.saveCount).toBe(settled);
  });

  it('a sync in flight at sign-out does not overwrite signed-out status', async () => {
    const { result } = renderBoth();
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    // Schedule a debounced push, then sign out before it can run.
    act(() => { result.current.cards.grade(9, 'fr-en', 3); });
    await act(async () => { adapter.emitUser(null); });

    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(result.current.sync.status).toBe('signed-out');
  });

  it('a sign-out during the remote write does not overwrite signed-out status', async () => {
    const base = createMockAdapter();
    // Non-nullable placeholders (rather than `T | null`) so reading them
    // outside the Promise executor that reassigns them doesn't get narrowed
    // away by control-flow analysis across the closure boundary.
    let releaseSave: () => void = () => {};
    let saveEntered: () => void = () => {};
    // Sign-in's own full sync (and the follow-up push it can trigger via
    // applyLocal) also goes through this adapter, so gate is keyed off the
    // save that actually carries the freshly graded card, not call order.
    let gated = false;
    const entered = new Promise<void>((res) => { saveEntered = res; });
    const gate = new Promise<void>((res) => { releaseSave = res; });
    const slow: MockAdapter = {
      ...base,
      get remote() { return base.remote; },
      set remote(v) { base.remote = v; },
      get saveCount() { return base.saveCount; },
      get loadCount() { return base.loadCount; },
      emitUser: base.emitUser,
      onAuthChange: base.onAuthChange,
      loadRemote: base.loadRemote,
      signIn: base.signIn,
      signOut: base.signOut,
      failNext: base.failNext,
      saveRemote: async (uid, blob) => {
        if (!gated && blob.cards['9:fr-en']) {
          gated = true;
          saveEntered();
          await gate;
        }
        return base.saveRemote(uid, blob);
      },
    };
    adapter = slow;

    const { result } = renderBoth();
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    // Schedule a debounced push carrying the freshly graded card and let it
    // reach the in-flight remote write.
    act(() => { result.current.cards.grade(9, 'fr-en', 3); });
    await act(async () => { await entered; });

    // Sign out while saveRemote is still awaiting its gate.
    await act(async () => { adapter.emitUser(null); });

    releaseSave();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(result.current.sync.status).toBe('signed-out');
  });

  it('records lastUid even when the first sync fails, so a later account does not inherit cards', async () => {
    // The failure must land on saveRemote (after loadRemote+merge+applyLocal
    // already ran), matching the real trace: a plain failNext() would instead
    // fail the loadRemote call that runs first, before the local store is
    // ever touched. A custom adapter lets the pull succeed and only the very
    // first save throw, exactly like C1's transient-network trace.
    const base = createMockAdapter();
    base.remote = { ...emptySyncedBlob(), cards: { '2:fr-en': card({ wordId: 2 }) } };
    let saveFailed = false;
    const flaky: MockAdapter = {
      ...base,
      get remote() { return base.remote; },
      set remote(v) { base.remote = v; },
      get saveCount() { return base.saveCount; },
      get loadCount() { return base.loadCount; },
      emitUser: base.emitUser,
      onAuthChange: base.onAuthChange,
      loadRemote: base.loadRemote,
      signIn: base.signIn,
      signOut: base.signOut,
      failNext: base.failNext,
      saveRemote: async (uid, blob) => {
        if (!saveFailed) {
          saveFailed = true;
          throw new Error('offline');
        }
        return base.saveRemote(uid, blob);
      },
    };
    adapter = flaky;

    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('error'));

    // Despite the failure, ownership is recorded.
    expect(JSON.parse(localStorage.getItem(SYNC_META_KEY)!).lastUid).toBe(USER.uid);

    // Now a different account signs in on the same browser.
    const bRemote = { ...emptySyncedBlob(), cards: { '9:fr-en': card({ wordId: 9 }) } };
    adapter.remote = bRemote;
    await act(async () => { adapter.emitUser(OTHER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    // B must NOT have inherited A's card 1, locally or in the remote it wrote.
    expect(result.current.cards.cards['1:fr-en']).toBeUndefined();
    expect(adapter.remote!.cards['1:fr-en']).toBeUndefined();
    expect(adapter.remote!.cards['9:fr-en']).toBeDefined();
  });

  it('a reset while signed out does not discard the cloud deck on next sign-in', async () => {
    const { result } = renderBoth();
    // Reset while signed out — must not advance the epoch.
    await act(async () => { result.current.cards.resetAll(); });
    const metaRaw = localStorage.getItem(SYNC_META_KEY);
    expect(metaRaw === null || JSON.parse(metaRaw).epoch === 0).toBe(true);

    // Sign into an account that has cards at epoch 0.
    adapter.remote = { ...emptySyncedBlob(), epoch: 0, cards: { '7:fr-en': card({ wordId: 7 }) } };
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    // The cloud deck survived — it was not out-ranked by the signed-out reset.
    expect(result.current.cards.cards['7:fr-en']).toBeDefined();
    expect(adapter.remote!.cards['7:fr-en']).toBeDefined();
  });

  it('renders children', () => {
    const { getByText } = render(
      <FlashcardProvider>
        <AuthProvider adapter={adapter}><p>ok</p></AuthProvider>
      </FlashcardProvider>,
    );
    expect(getByText('ok')).toBeInTheDocument();
  });
});
