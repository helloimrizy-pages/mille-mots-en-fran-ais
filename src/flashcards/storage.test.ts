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
      version: 2,
      cards: {},
      log: [],
      settings: { requestRetention: 2, typedCheck: 'yes', lastGoal: 20, lastFilter: null, lastDirections: null },
    }));
    const blob = load();
    expect(blob.settings.requestRetention).toBe(0.95);
    expect(blob.settings.typedCheck).toBe(true);
    expect(blob.settings.lastFilter).toEqual([]);
    expect(blob.settings.lastDirections).toEqual([]);
  });

  it('falls back to the default lastGoal when the stored value is not a legal goal', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      cards: {},
      log: [],
      settings: { requestRetention: 0.9, typedCheck: false, lastGoal: 'bogus', lastFilter: [], lastDirections: [] },
    }));
    const blob = load();
    expect(blob.settings.lastGoal).toBe(DEFAULT_SETTINGS.lastGoal);
  });

  it('accepts every legal lastGoal value unchanged', () => {
    for (const goal of [10, 20, 50, 'unlimited'] as const) {
      localStorage.clear();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2,
        cards: {},
        log: [],
        settings: { requestRetention: 0.9, typedCheck: false, lastGoal: goal, lastFilter: [], lastDirections: [] },
      }));
      expect(load().settings.lastGoal).toBe(goal);
    }
  });

  it('migrates a v1 blob, preserving cards and log, and writes a backup', () => {
    const card = {
      wordId: 7, direction: 'fr-en' as const,
      stability: 4, difficulty: 6,
      elapsedDays: 1, scheduledDays: 4, reps: 3, lapses: 1,
      state: 'review' as const,
      lastReview: '2026-04-22T00:00:00.000Z', due: '2026-04-26T00:00:00.000Z',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      cards: { '7:fr-en': card },
      log: [{
        wordId: 7, direction: 'fr-en', grade: 3,
        reviewedAt: '2026-04-22T00:00:00.000Z', elapsedDays: 1, scheduledDays: 4, state: 'review',
      }],
      settings: { newPerDay: 42, requestRetention: 0.9, typedCheck: false, lastGoal: 20, lastFilter: [], lastDirections: [] },
      daily: { date: '2026-04-23', newIntroduced: 5 },
    }));
    const blob = load();
    expect(blob.version).toBe(2);
    expect(blob.cards['7:fr-en']).toEqual(card);
    expect(blob.log.length).toBe(1);
    // localStorage is the only copy of a user's SRS history in this
    // backend-less app, so the raw v1 blob must be backed up before the
    // debounced save overwrites it with the migrated v2 shape.
    expect(localStorage.getItem(BACKUP_KEY)).not.toBeNull();
    expect(localStorage.getItem(BACKUP_KEY)).toContain('"version":1');
  });

  it('drops newPerDay and daily when migrating', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1, cards: {}, log: [],
      settings: { newPerDay: 42, requestRetention: 0.9, typedCheck: false, lastGoal: 20, lastFilter: [], lastDirections: [] },
      daily: { date: '2026-04-23', newIntroduced: 5 },
    }));
    const blob = load();
    expect('newPerDay' in blob.settings).toBe(false);
    expect('daily' in blob).toBe(false);
  });

  it('caps log at MAX_LOG_ENTRIES when loading', () => {
    const bigLog = Array.from({ length: MAX_LOG_ENTRIES + 100 }, (_, i) => ({
      wordId: i, direction: 'fr-en' as const, grade: 3 as const,
      reviewedAt: '2026-04-23T00:00:00.000Z', elapsedDays: 0, scheduledDays: 1, state: 'learning' as const,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2, cards: {}, log: bigLog, settings: DEFAULT_SETTINGS,
    }));
    expect(load().log.length).toBe(MAX_LOG_ENTRIES);
  });
});

describe('importJson', () => {
  it('parses a valid export', () => {
    const blob = emptyBlob();
    blob.settings.requestRetention = 0.85;
    const json = exportJson(blob);
    const imported = importJson(json);
    expect(imported?.settings.requestRetention).toBe(0.85);
  });

  it('accepts a v1 export and migrates it', () => {
    const imported = importJson(JSON.stringify({
      version: 1, cards: {}, log: [],
      settings: { newPerDay: 42, requestRetention: 0.9, typedCheck: false, lastGoal: 20, lastFilter: [], lastDirections: [] },
      daily: { date: '2026-04-23', newIntroduced: 5 },
    }));
    expect(imported?.version).toBe(2);
    expect('newPerDay' in (imported?.settings ?? {})).toBe(false);
  });

  it('rejects wrong version', () => {
    expect(importJson(JSON.stringify({ version: 999 }))).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(importJson('{not json')).toBeNull();
  });
});
