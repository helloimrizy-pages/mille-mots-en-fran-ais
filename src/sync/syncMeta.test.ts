import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SYNC_META, SYNC_META_KEY, loadSyncMeta, saveSyncMeta } from './syncMeta';
import type { SyncMeta } from './types';

afterEach(() => localStorage.clear());

describe('syncMeta', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSyncMeta()).toEqual(DEFAULT_SYNC_META);
  });

  it('defaults to a first-sign-in posture', () => {
    const meta = loadSyncMeta();
    expect(meta.lastUid).toBeNull();
    expect(meta.epoch).toBe(0);
    expect(meta.settingsUpdatedAt).toBe(0);
    expect(meta.playUpdatedAt).toBe(0);
    expect(meta.lastSyncedAt).toBeNull();
  });

  it('round-trips a full record', () => {
    const meta: SyncMeta = {
      version: 1,
      lastUid: 'uid-abc',
      epoch: 3,
      settingsUpdatedAt: 1_700_000_000_000,
      playUpdatedAt: 1_700_000_001_000,
      lastSyncedAt: 1_700_000_002_000,
    };
    saveSyncMeta(meta);
    expect(loadSyncMeta()).toEqual(meta);
  });

  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem(SYNC_META_KEY, '{not json');
    expect(loadSyncMeta()).toEqual(DEFAULT_SYNC_META);
  });

  it('falls back to defaults on a wrong version', () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ version: 99, lastUid: 'x', epoch: 5 }));
    expect(loadSyncMeta()).toEqual(DEFAULT_SYNC_META);
  });

  it('coerces non-numeric counters to zero rather than NaN', () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({
      version: 1, lastUid: 'uid', epoch: 'bogus',
      settingsUpdatedAt: null, playUpdatedAt: undefined, lastSyncedAt: 'nope',
    }));
    const meta = loadSyncMeta();
    expect(meta.epoch).toBe(0);
    expect(meta.settingsUpdatedAt).toBe(0);
    expect(meta.playUpdatedAt).toBe(0);
    expect(meta.lastSyncedAt).toBeNull();
    expect(meta.lastUid).toBe('uid');
  });

  it('coerces a non-string lastUid to null', () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ version: 1, lastUid: 42, epoch: 1 }));
    expect(loadSyncMeta().lastUid).toBeNull();
  });
});
