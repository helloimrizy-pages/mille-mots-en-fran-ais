import { beforeEach, describe, expect, it } from 'vitest';
import { BACKUP_KEY, STORAGE_KEY, emptyBlob, exportJson, importJson, load, save } from './storage';
import { DEFAULT_SETTINGS, MAX_LOG_ENTRIES } from './types';

beforeEach(() => {
  localStorage.clear();
});

describe('load', () => {
  it('returns an empty blob when storage is empty', () => {
    const blob = load();
    expect(blob.cards).toEqual({});
    expect(blob.log).toEqual([]);
    expect(blob.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a saved blob', () => {
    const saved = emptyBlob();
    saved.cards['1:fr-en'] = {
      wordId: 1, direction: 'fr-en',
      stability: 2, difficulty: 3,
      elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0,
      state: 'learning', lastReview: '2026-04-23T00:00:00.000Z', due: '2026-04-24T00:00:00.000Z',
    };
    save(saved);
    const loaded = load();
    expect(loaded.cards['1:fr-en']).toEqual(saved.cards['1:fr-en']);
  });

  it('returns empty blob and preserves backup on version mismatch', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, cards: {} }));
    const blob = load();
    expect(blob.cards).toEqual({});
    expect(localStorage.getItem(BACKUP_KEY)).toContain('"version":999');
  });

  it('returns empty blob on malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(load().cards).toEqual({});
  });

  it('clamps settings to valid ranges', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      cards: {},
      log: [],
      settings: { newPerDay: 9999, requestRetention: 2, typedCheck: 'yes', lastGoal: 20, lastFilter: null, lastDirections: null },
      daily: { date: '2026-04-23', newIntroduced: 0 },
    }));
    const blob = load();
    expect(blob.settings.newPerDay).toBe(50);
    expect(blob.settings.requestRetention).toBe(0.95);
    expect(blob.settings.typedCheck).toBe(true);
    expect(blob.settings.lastFilter).toEqual([]);
    expect(blob.settings.lastDirections).toEqual([]);
  });

  it('caps log at MAX_LOG_ENTRIES when loading', () => {
    const bigLog = Array.from({ length: MAX_LOG_ENTRIES + 100 }, (_, i) => ({
      wordId: i, direction: 'fr-en' as const, grade: 3 as const,
      reviewedAt: '2026-04-23T00:00:00.000Z', elapsedDays: 0, scheduledDays: 1, state: 'learning' as const,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1, cards: {}, log: bigLog, settings: DEFAULT_SETTINGS,
      daily: { date: '2026-04-23', newIntroduced: 0 },
    }));
    expect(load().log.length).toBe(MAX_LOG_ENTRIES);
  });
});

describe('importJson', () => {
  it('parses a valid export', () => {
    const blob = emptyBlob();
    blob.settings.newPerDay = 15;
    const json = exportJson(blob);
    const imported = importJson(json);
    expect(imported?.settings.newPerDay).toBe(15);
  });

  it('rejects wrong version', () => {
    expect(importJson(JSON.stringify({ version: 999 }))).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(importJson('{not json')).toBeNull();
  });
});
