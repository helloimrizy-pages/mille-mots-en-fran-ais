import { describe, expect, it } from 'vitest';
import type { Word } from '../types';
import type { CardState, Direction } from '../flashcards/types';
import { cardKey } from '../flashcards/types';
import { bucketCounts, cardStrength, retrievability, wordStrength } from './strength';

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

function makeCard(overrides: Partial<CardState> = {}): CardState {
  return {
    wordId: 1, direction: 'fr-en',
    stability: 10, difficulty: 5,
    elapsedDays: 0, scheduledDays: 10, reps: 2, lapses: 0,
    state: 'review',
    lastReview: NOW.toISOString(),
    due: new Date(NOW.getTime() + 10 * MS_PER_DAY).toISOString(),
    ...overrides,
  };
}

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * MS_PER_DAY).toISOString();
}

describe('retrievability', () => {
  it('is 1 immediately after review', () => {
    expect(retrievability(makeCard(), NOW)).toBeCloseTo(1, 6);
  });

  it('is 0.9 when elapsed time equals stability', () => {
    const card = makeCard({ stability: 10, lastReview: daysAgo(10) });
    expect(retrievability(card, NOW)).toBeCloseTo(0.9, 6);
  });

  it('is 0 for a card that has never been reviewed', () => {
    expect(retrievability(makeCard({ lastReview: null }), NOW)).toBe(0);
  });

  it('decreases as time passes', () => {
    const recent = retrievability(makeCard({ lastReview: daysAgo(5) }), NOW);
    const older = retrievability(makeCard({ lastReview: daysAgo(20) }), NOW);
    expect(older).toBeLessThan(recent);
  });
});

describe('cardStrength', () => {
  it('treats a missing card as new', () => {
    expect(cardStrength(undefined, NOW)).toBe('new');
  });

  it('treats a new-state card as new', () => {
    expect(cardStrength(makeCard({ state: 'new' }), NOW)).toBe('new');
  });

  it('treats a relearning card as almost-forgotten', () => {
    expect(cardStrength(makeCard({ state: 'relearning' }), NOW)).toBe('almost-forgotten');
  });

  it('treats retrievability below 0.7 as almost-forgotten', () => {
    const card = makeCard({ stability: 10, lastReview: daysAgo(45) });
    expect(retrievability(card, NOW)).toBeLessThan(0.7);
    expect(cardStrength(card, NOW)).toBe('almost-forgotten');
  });

  it('treats a learning card as just-seen', () => {
    expect(cardStrength(makeCard({ state: 'learning' }), NOW)).toBe('just-seen');
  });

  it('treats stability under a day as just-seen', () => {
    expect(cardStrength(makeCard({ stability: 0.5 }), NOW)).toBe('just-seen');
  });

  it('treats stability under a week as shaky', () => {
    expect(cardStrength(makeCard({ stability: 3 }), NOW)).toBe('shaky');
  });

  it('treats stability under a month as getting-solid', () => {
    expect(cardStrength(makeCard({ stability: 10 }), NOW)).toBe('getting-solid');
  });

  it('treats stability of a month or more as solid', () => {
    expect(cardStrength(makeCard({ stability: 60 }), NOW)).toBe('solid');
  });
});

describe('wordStrength', () => {
  function cardsFor(entries: Array<[Direction, Partial<CardState>]>): Record<string, CardState> {
    const out: Record<string, CardState> = {};
    for (const [direction, overrides] of entries) {
      out[cardKey(1, direction)] = makeCard({ direction, ...overrides });
    }
    return out;
  }

  it('is new when the word has no cards at all', () => {
    expect(wordStrength(makeWord(1), {}, NOW)).toBe('new');
  });

  it('is new when every card is in the new state', () => {
    const cards = cardsFor([['fr-en', { state: 'new' }], ['en-fr', { state: 'new' }]]);
    expect(wordStrength(makeWord(1), cards, NOW)).toBe('new');
  });

  it('ignores unseen directions when one direction is seen', () => {
    const cards = cardsFor([['fr-en', { stability: 60 }], ['en-fr', { state: 'new' }]]);
    expect(wordStrength(makeWord(1), cards, NOW)).toBe('solid');
  });

  it('takes the weakest of two seen directions', () => {
    const cards = cardsFor([['fr-en', { stability: 60 }], ['en-fr', { stability: 3 }]]);
    expect(wordStrength(makeWord(1), cards, NOW)).toBe('shaky');
  });
});

describe('bucketCounts', () => {
  it('tallies every word into exactly one bucket', () => {
    const words = [makeWord(1), makeWord(2), makeWord(3)];
    const cards: Record<string, CardState> = {
      [cardKey(1, 'fr-en')]: makeCard({ wordId: 1, stability: 60 }),
      [cardKey(2, 'fr-en')]: makeCard({ wordId: 2, stability: 3 }),
    };
    const counts = bucketCounts(words, cards, NOW);
    expect(counts.solid).toBe(1);
    expect(counts.shaky).toBe(1);
    expect(counts.new).toBe(1);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(3);
  });
});
