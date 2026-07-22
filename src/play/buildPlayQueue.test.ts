import { describe, expect, it } from 'vitest';
import type { Word } from '../types';
import { cardKey, type CardState, type Direction } from '../flashcards/types';
import { buildPlayQueue } from './buildPlayQueue';
import type { PlaySettings } from './types';

function makeWord(id: number, overrides: Partial<Word> = {}): Word {
  return {
    id, rank: id, french: `mot${id}`, english: `meaning${id}`, pos: 'noun',
    ipa: '/test/', example: { fr: 'Ex.', en: 'Ex.' }, audio: { word: 'w.mp3', sentence: 's.mp3' },
    ...overrides,
  };
}

function studiedCard(wordId: number, direction: Direction): [string, CardState] {
  return [cardKey(wordId, direction), {
    wordId, direction,
    stability: 10, difficulty: 5,
    elapsedDays: 0, scheduledDays: 10, reps: 2, lapses: 0,
    state: 'review',
    lastReview: new Date().toISOString(),
    due: new Date().toISOString(),
  }];
}

const pool = Array.from({ length: 8 }, (_, i) => makeWord(i + 1));
const settings = (o: Partial<PlaySettings> = {}): PlaySettings => ({
  activities: ['flashcard', 'choice', 'type', 'listen'],
  repsPerWord: 2,
  wordCount: 20,
  source: 'review',
  buckets: [],
  ...o,
});

describe('buildPlayQueue', () => {
  it('produces repsPerWord items per selected word', () => {
    const selected = [makeWord(1), makeWord(2), makeWord(3)];
    const queue = buildPlayQueue({ selected, pool, settings: settings({ repsPerWord: 2 }), rng: () => 0 });
    expect(queue).toHaveLength(6);
    for (const w of selected) {
      expect(queue.filter((it) => it.word.id === w.id)).toHaveLength(2);
    }
  });

  it('only uses enabled activity types', () => {
    const queue = buildPlayQueue({ selected: [makeWord(1)], pool, settings: settings({ activities: ['choice'] }), rng: () => 0 });
    expect(queue.every((it) => it.activity === 'choice')).toBe(true);
  });

  it('gives choice and listen items four unique choices including the answer', () => {
    const queue = buildPlayQueue({ selected: [makeWord(1)], pool, settings: settings({ activities: ['choice', 'listen'], repsPerWord: 2 }), rng: () => 0.5 });
    for (const it of queue) {
      expect(it.choices).toBeDefined();
      expect(it.choices).toHaveLength(4);
      expect(it.choices!.some((c) => c.id === it.word.id)).toBe(true);
      expect(new Set(it.choices!.map((c) => c.id)).size).toBe(4);
    }
  });

  it('always uses fr-en direction for listen and flashcard', () => {
    const queue = buildPlayQueue({ selected: pool, pool, settings: settings({ activities: ['flashcard', 'listen'] }), rng: () => 0.9 });
    expect(queue.every((it) => it.direction === 'fr-en')).toBe(true);
  });

  it('is deterministic for a fixed rng', () => {
    const a = buildPlayQueue({ selected: [makeWord(1), makeWord(2)], pool, settings: settings(), rng: () => 0.3 });
    const b = buildPlayQueue({ selected: [makeWord(1), makeWord(2)], pool, settings: settings(), rng: () => 0.3 });
    expect(a.map((it) => [it.word.id, it.activity, it.direction])).toEqual(b.map((it) => [it.word.id, it.activity, it.direction]));
  });

  describe('direction restricted to studied directions', () => {
    it('behaves as before when no cards map is supplied', () => {
      const queue = buildPlayQueue({ selected: [makeWord(1)], pool, settings: settings({ activities: ['choice'] }), rng: () => 0.9 });
      expect(queue.every((it) => it.direction === 'en-fr')).toBe(true);
    });

    it('behaves as before when the word has no stored cards', () => {
      const queue = buildPlayQueue({ selected: [makeWord(1)], pool, cards: {}, settings: settings({ activities: ['choice'] }), rng: () => 0.9 });
      expect(queue.every((it) => it.direction === 'en-fr')).toBe(true);
    });

    it('never yields an en-fr item for a word studied only in fr-en', () => {
      const cards = Object.fromEntries([studiedCard(1, 'fr-en')]);
      const queue = buildPlayQueue({
        selected: [makeWord(1)], pool, cards,
        settings: settings({ activities: ['flashcard', 'choice', 'type', 'listen'], repsPerWord: 3 }),
        rng: () => 0.9,
      });
      expect(queue.every((it) => it.direction === 'fr-en')).toBe(true);
    });

    it('excludes flashcard and listen, and only yields en-fr, for a word studied only in en-fr', () => {
      const cards = Object.fromEntries([studiedCard(1, 'en-fr')]);
      const queue = buildPlayQueue({
        selected: [makeWord(1)], pool, cards,
        settings: settings({ activities: ['flashcard', 'choice', 'type', 'listen'], repsPerWord: 3 }),
        rng: () => 0.9,
      });
      expect(queue.every((it) => it.activity !== 'flashcard' && it.activity !== 'listen')).toBe(true);
      expect(queue.every((it) => it.direction === 'en-fr')).toBe(true);
    });

    it('falls back to the full enabled list rather than producing no items when restriction would empty it', () => {
      const cards = Object.fromEntries([studiedCard(1, 'en-fr')]);
      const queue = buildPlayQueue({
        selected: [makeWord(1)], pool, cards,
        settings: settings({ activities: ['flashcard'], repsPerWord: 2 }),
        rng: () => 0.9,
      });
      expect(queue.length).toBe(2);
      expect(queue.every((it) => it.activity === 'flashcard')).toBe(true);
    });
  });
});
