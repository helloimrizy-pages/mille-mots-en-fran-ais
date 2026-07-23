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

  it('renders children', () => {
    const { getByText } = render(
      <FlashcardProvider>
        <AuthProvider adapter={adapter}><p>ok</p></AuthProvider>
      </FlashcardProvider>,
    );
    expect(getByText('ok')).toBeInTheDocument();
  });
});
