import { describe, expect, it } from 'vitest';
import type { CardState } from '../flashcards/types';
import { DEFAULT_SETTINGS } from '../flashcards/types';
import { DEFAULT_PLAY_SETTINGS } from '../play/types';
import { mergeBlobs } from './merge';
import { emptySyncedBlob, type SyncedBlob } from './types';

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

function blob(overrides: Partial<SyncedBlob> = {}): SyncedBlob {
  return { ...emptySyncedBlob(), ...overrides };
}

describe('mergeBlobs — no remote', () => {
  it('returns local unchanged when remote is null', () => {
    const local = blob({ cards: { '1:fr-en': card() } });
    const result = mergeBlobs(local, null);
    expect(result.blob).toEqual(local);
    expect(result.resetApplied).toBe(false);
  });

  it('does not share references with local when remote is null', () => {
    const local = blob({ cards: { '1:fr-en': card() } });
    const result = mergeBlobs(local, null);
    expect(result.blob.cards).not.toBe(local.cards);
    expect(result.blob.settings).not.toBe(local.settings);
    expect(result.blob.play).not.toBe(local.play);
    // and mutating the result must not reach the input
    result.blob.cards['2:fr-en'] = card({ wordId: 2 });
    expect(local.cards['2:fr-en']).toBeUndefined();
  });
});

describe('mergeBlobs — cards', () => {
  it('unions disjoint cards from both sides', () => {
    const local = blob({ cards: { '1:fr-en': card({ wordId: 1 }) } });
    const remote = blob({ cards: { '2:fr-en': card({ wordId: 2 }) } });
    const { blob: merged } = mergeBlobs(local, remote);
    expect(Object.keys(merged.cards).sort()).toEqual(['1:fr-en', '2:fr-en']);
  });

  it('keeps the card with the newer lastReview when local is newer', () => {
    const local = blob({ cards: { '1:fr-en': card({ lastReview: '2026-07-05T00:00:00.000Z', reps: 9 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ lastReview: '2026-07-01T00:00:00.000Z', reps: 1 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.reps).toBe(9);
  });

  it('keeps the card with the newer lastReview when remote is newer', () => {
    const local = blob({ cards: { '1:fr-en': card({ lastReview: '2026-07-01T00:00:00.000Z', reps: 1 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ lastReview: '2026-07-05T00:00:00.000Z', reps: 9 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.reps).toBe(9);
  });

  it('prefers a card with a lastReview over one without', () => {
    const local = blob({ cards: { '1:fr-en': card({ lastReview: null, reps: 0 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ lastReview: '2026-07-01T00:00:00.000Z', reps: 4 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.reps).toBe(4);
  });

  it('breaks a lastReview tie on reps', () => {
    const local = blob({ cards: { '1:fr-en': card({ reps: 2, lapses: 1 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ reps: 7, lapses: 3 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.lapses).toBe(3);
  });

  it('breaks a full tie in favour of local', () => {
    const local = blob({ cards: { '1:fr-en': card({ difficulty: 1 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ difficulty: 9 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.difficulty).toBe(1);
  });

  it('breaks a both-null-lastReview tie on reps', () => {
    const local = blob({ cards: { '1:fr-en': card({ lastReview: null, reps: 0, lapses: 0 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ lastReview: null, reps: 3, lapses: 2 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.lapses).toBe(2);
  });

  it('never drops a card present on only one side', () => {
    const local = blob({ cards: { '1:fr-en': card(), '2:fr-en': card({ wordId: 2 }) } });
    const remote = blob({ cards: { '1:fr-en': card() } });
    expect(mergeBlobs(local, remote).blob.cards['2:fr-en']).toBeDefined();
  });
});

describe('mergeBlobs — epoch reset', () => {
  it('discards local cards when the remote epoch is ahead', () => {
    const local = blob({ epoch: 1, cards: { '1:fr-en': card(), '2:fr-en': card({ wordId: 2 }) } });
    const remote = blob({ epoch: 2, cards: {} });
    const result = mergeBlobs(local, remote);
    expect(result.blob.cards).toEqual({});
    expect(result.blob.epoch).toBe(2);
    expect(result.resetApplied).toBe(true);
  });

  it('discards remote cards when the local epoch is ahead', () => {
    const local = blob({ epoch: 5, cards: {} });
    const remote = blob({ epoch: 4, cards: { '1:fr-en': card() } });
    const result = mergeBlobs(local, remote);
    expect(result.blob.cards).toEqual({});
    expect(result.blob.epoch).toBe(5);
    expect(result.resetApplied).toBe(false);
  });

  it('merges normally at equal epochs', () => {
    const local = blob({ epoch: 3, cards: { '1:fr-en': card() } });
    const remote = blob({ epoch: 3, cards: { '2:fr-en': card({ wordId: 2 }) } });
    const result = mergeBlobs(local, remote);
    expect(Object.keys(result.blob.cards).sort()).toEqual(['1:fr-en', '2:fr-en']);
    expect(result.blob.epoch).toBe(3);
    expect(result.resetApplied).toBe(false);
  });
});

describe('mergeBlobs — settings and play', () => {
  it('takes remote settings when remote is newer', () => {
    const local = blob({ settings: { ...DEFAULT_SETTINGS, typedCheck: false }, settingsUpdatedAt: 100 });
    const remote = blob({ settings: { ...DEFAULT_SETTINGS, typedCheck: true }, settingsUpdatedAt: 200 });
    const { blob: merged } = mergeBlobs(local, remote);
    expect(merged.settings.typedCheck).toBe(true);
    expect(merged.settingsUpdatedAt).toBe(200);
  });

  it('keeps local settings when local is newer', () => {
    const local = blob({ settings: { ...DEFAULT_SETTINGS, typedCheck: true }, settingsUpdatedAt: 300 });
    const remote = blob({ settings: { ...DEFAULT_SETTINGS, typedCheck: false }, settingsUpdatedAt: 200 });
    expect(mergeBlobs(local, remote).blob.settings.typedCheck).toBe(true);
  });

  it('keeps local settings on a timestamp tie', () => {
    const local = blob({ settings: { ...DEFAULT_SETTINGS, requestRetention: 0.85 }, settingsUpdatedAt: 500 });
    const remote = blob({ settings: { ...DEFAULT_SETTINGS, requestRetention: 0.95 }, settingsUpdatedAt: 500 });
    expect(mergeBlobs(local, remote).blob.settings.requestRetention).toBe(0.85);
  });

  it('resolves settings and play independently of each other', () => {
    const local = blob({
      settings: { ...DEFAULT_SETTINGS, typedCheck: false }, settingsUpdatedAt: 100,
      play: { ...DEFAULT_PLAY_SETTINGS, repsPerWord: 3 }, playUpdatedAt: 900,
    });
    const remote = blob({
      settings: { ...DEFAULT_SETTINGS, typedCheck: true }, settingsUpdatedAt: 800,
      play: { ...DEFAULT_PLAY_SETTINGS, repsPerWord: 2 }, playUpdatedAt: 200,
    });
    const { blob: merged } = mergeBlobs(local, remote);
    expect(merged.settings.typedCheck).toBe(true);
    expect(merged.play.repsPerWord).toBe(3);
  });
});

describe('mergeBlobs — purity', () => {
  it('does not mutate either input', () => {
    const local = blob({ cards: { '1:fr-en': card({ reps: 1 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ reps: 2, lastReview: '2026-08-01T00:00:00.000Z' }) } });
    const localCopy = structuredClone(local);
    const remoteCopy = structuredClone(remote);
    mergeBlobs(local, remote);
    expect(local).toEqual(localCopy);
    expect(remote).toEqual(remoteCopy);
  });
});
