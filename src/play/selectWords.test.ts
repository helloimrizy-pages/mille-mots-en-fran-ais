import { describe, expect, it } from 'vitest';
import type { Word } from '../types';
import type { CardState, Direction } from '../flashcards/types';
import { cardKey } from '../flashcards/types';
import { countDue, selectPlayWords } from './selectWords';

const NOW = new Date('2026-07-22T12:00:00Z');
const MS_PER_DAY = 86_400_000;

function makeWord(id: number): Word {
  return {
    id, rank: id,
    french: `mot${id}`, english: `meaning${id}`,
    pos: 'noun', ipa: '/x/',
    example: { fr: 'Ex.', en: 'Ex.' },
    audio: { word: 'w.mp3', sentence: 's.mp3' },
  };
}

function seen(
  wordId: number,
  direction: Direction,
  overrides: Partial<CardState> = {},
): [string, CardState] {
  return [cardKey(wordId, direction), {
    wordId, direction,
    stability: 10, difficulty: 5,
    elapsedDays: 0, scheduledDays: 10, reps: 2, lapses: 0,
    state: 'review',
    lastReview: NOW.toISOString(),
    due: new Date(NOW.getTime() + 10 * MS_PER_DAY).toISOString(),
    ...overrides,
  }];
}

function base(words: Word[], cards: Record<string, CardState>) {
  return { words, cards, selected: [], buckets: [], count: 'all' as const, now: NOW };
}

describe('selectPlayWords — selected', () => {
  it('returns the selection verbatim, ignoring count', () => {
    const selection = [makeWord(3), makeWord(1)];
    const result = selectPlayWords({
      ...base([makeWord(1), makeWord(2), makeWord(3)], {}),
      source: 'selected', selected: selection, count: 10,
    });
    expect(result).toEqual(selection);
  });
});

describe('selectPlayWords — new', () => {
  it('returns only words with no seen card, sorted by rank', () => {
    const words = [makeWord(3), makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([seen(2, 'fr-en')]);
    const result = selectPlayWords({ ...base(words, cards), source: 'new' });
    expect(result.map((w) => w.id)).toEqual([1, 3]);
  });

  it('excludes a word when only one direction is seen', () => {
    const words = [makeWord(1)];
    const cards = Object.fromEntries([seen(1, 'en-fr')]);
    const result = selectPlayWords({ ...base(words, cards), source: 'new' });
    expect(result).toEqual([]);
  });

  it('respects a numeric count', () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(i + 1));
    const result = selectPlayWords({ ...base(words, {}), source: 'new', count: 10 });
    expect(result.length).toBe(10);
  });

  it('returns everything for count "all"', () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(i + 1));
    const result = selectPlayWords({ ...base(words, {}), source: 'new', count: 'all' });
    expect(result.length).toBe(30);
  });
});

describe('selectPlayWords — review', () => {
  it('excludes words that have never been seen', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([seen(1, 'fr-en')]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([1]);
  });

  it('includes a word when only one direction is seen', () => {
    const words = [makeWord(1)];
    const cards = Object.fromEntries([seen(1, 'en-fr')]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([1]);
  });

  it('puts due words before not-due ones', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en'),
      seen(2, 'fr-en', { due: new Date(NOW.getTime() - MS_PER_DAY).toISOString() }),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([2, 1]);
  });

  it('sorts due words by earliest due date', () => {
    const words = [makeWord(1), makeWord(2), makeWord(3)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { due: new Date(NOW.getTime() - 1 * MS_PER_DAY).toISOString() }),
      seen(2, 'fr-en', { due: new Date(NOW.getTime() - 9 * MS_PER_DAY).toISOString() }),
      seen(3, 'fr-en', { due: new Date(NOW.getTime() - 5 * MS_PER_DAY).toISOString() }),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([2, 3, 1]);
  });

  it('uses the earliest due date across both directions', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { due: new Date(NOW.getTime() + MS_PER_DAY).toISOString() }),
      seen(1, 'en-fr', { due: new Date(NOW.getTime() - MS_PER_DAY).toISOString() }),
      seen(2, 'fr-en'),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([1, 2]);
  });

  it('tops up with the weakest not-yet-due words first', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { stability: 100 }),
      seen(2, 'fr-en', { stability: 100, lastReview: new Date(NOW.getTime() - 50 * MS_PER_DAY).toISOString() }),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([2, 1]);
  });

  it('filters by bucket when buckets are given', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { stability: 60 }),
      seen(2, 'fr-en', { stability: 3 }),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review', buckets: ['shaky'] });
    expect(result.map((w) => w.id)).toEqual([2]);
  });

  it('includes all buckets when the filter is empty', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { stability: 60 }),
      seen(2, 'fr-en', { stability: 3 }),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review', buckets: [] });
    expect(result.length).toBe(2);
  });

  it('returns an empty list when nothing has been played', () => {
    const result = selectPlayWords({ ...base([makeWord(1)], {}), source: 'review' });
    expect(result).toEqual([]);
  });

  it('respects a numeric count', () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(i + 1));
    const cards = Object.fromEntries(words.map((w) => seen(w.id, 'fr-en')));
    const result = selectPlayWords({ ...base(words, cards), source: 'review', count: 10 });
    expect(result.length).toBe(10);
  });
});

describe('countDue', () => {
  it('counts only words with a card due now or earlier', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { due: new Date(NOW.getTime() - MS_PER_DAY).toISOString() }),
      seen(2, 'fr-en'),
    ]);
    expect(countDue(words, cards, NOW)).toBe(1);
  });

  it('is zero for unseen words', () => {
    expect(countDue([makeWord(1)], {}, NOW)).toBe(0);
  });
});
