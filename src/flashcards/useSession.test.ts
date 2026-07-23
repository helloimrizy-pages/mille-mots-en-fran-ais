import { describe, expect, it } from 'vitest';
import { planSession } from './useSession';
import type { FlashcardApi } from '../contexts/FlashcardContext';
import type { Word } from '../types';
import type { CardState, StudySettings } from './types';
import { DEFAULT_SETTINGS, cardKey } from './types';

const NOW = new Date('2026-04-23T12:00:00Z');

function makeWord(id: number, overrides: Partial<Word> = {}): Word {
  return {
    id,
    rank: id,
    french: `word${id}`,
    english: `meaning${id}`,
    pos: 'noun',
    ipa: '/ˈtest/',
    example: { fr: 'Exemple.', en: 'Example.' },
    audio: { word: 'w.mp3', sentence: 's.mp3' },
    ...overrides,
  };
}

function makeApi(
  cards: Record<string, CardState> = {},
  settings: Partial<StudySettings> = {},
): FlashcardApi {
  return {
    cards,
    log: [],
    settings: { ...DEFAULT_SETTINGS, ...settings },
    getBlob: () => ({ version: 2, cards, log: [], settings: { ...DEFAULT_SETTINGS, ...settings } }),
    replaceBlob: () => {},
    dueCount: () => 0,
    getCard: () => ({} as CardState),
    grade: () => {},
    updateSettings: () => {},
    resetAll: () => {},
    exportJson: () => '',
    importJson: () => true,
  };
}

function reviewCard(wordId: number, direction: 'fr-en' | 'en-fr', due: Date, state: CardState['state'] = 'review'): CardState {
  return {
    wordId, direction,
    stability: 1, difficulty: 5,
    elapsedDays: 1, scheduledDays: 1, reps: 1, lapses: 0,
    state,
    lastReview: '2026-04-22T12:00:00Z',
    due: due.toISOString(),
  };
}

describe('planSession', () => {
  it('returns every new card for a fresh deck', () => {
    const words = Array.from({ length: 5 }, (_, i) => makeWord(i + 1));
    const plan = planSession({
      words, api: makeApi(),
      filter: [], directions: ['fr-en'], goal: 'unlimited', now: NOW,
    });
    expect(plan.queue.length).toBe(5);
    expect(plan.queue.every((c) => c.isNew)).toBe(true);
  });

  it('includes due cards before new cards', () => {
    const words = [makeWord(1), makeWord(2)];
    const past = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    const cards: Record<string, CardState> = {
      [cardKey(1, 'fr-en')]: reviewCard(1, 'fr-en', past),
    };
    const plan = planSession({
      words, api: makeApi(cards),
      filter: [], directions: ['fr-en'], goal: 20, now: NOW,
    });
    expect(plan.queue[0]!.word.id).toBe(1);
    expect(plan.queue[0]!.isNew).toBe(false);
    expect(plan.queue.slice(1).every((c) => c.isNew)).toBe(true);
  });

  it('honors session goal', () => {
    const words = Array.from({ length: 50 }, (_, i) => makeWord(i + 1));
    const plan = planSession({
      words, api: makeApi(),
      filter: [], directions: ['fr-en'], goal: 10, now: NOW,
    });
    expect(plan.queue.length).toBe(10);
  });

  it('filters by part of speech (multi-select)', () => {
    const words = [
      makeWord(1, { pos: 'noun' }),
      makeWord(2, { pos: 'verb' }),
      makeWord(3, { pos: 'adjective' }),
    ];
    const plan = planSession({
      words, api: makeApi(),
      filter: ['noun', 'verb'], directions: ['fr-en'], goal: 'unlimited', now: NOW,
    });
    expect(plan.queue.map((c) => c.word.pos).sort()).toEqual(['noun', 'verb']);
  });

  it('empty filter means all PoS', () => {
    const words = [
      makeWord(1, { pos: 'noun' }),
      makeWord(2, { pos: 'verb' }),
    ];
    const plan = planSession({
      words, api: makeApi(),
      filter: [], directions: ['fr-en'], goal: 'unlimited', now: NOW,
    });
    expect(plan.queue.length).toBe(2);
  });

  it('empty directions means both', () => {
    const words = [makeWord(1)];
    const plan = planSession({
      words, api: makeApi(),
      filter: [], directions: [], goal: 'unlimited', now: NOW,
    });
    expect(plan.queue.map((c) => c.direction).sort()).toEqual(['en-fr', 'fr-en']);
  });

  it('excludes cards with future due dates from due pool', () => {
    const words = [makeWord(1)];
    const future = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const cards = { [cardKey(1, 'fr-en')]: reviewCard(1, 'fr-en', future) };
    const plan = planSession({
      words, api: makeApi(cards),
      filter: [], directions: ['fr-en'], goal: 'unlimited', now: NOW,
    });
    expect(plan.queue.length).toBe(0);
  });

  it('reports dueCount and newAvailable separately', () => {
    const words = [makeWord(1), makeWord(2), makeWord(3)];
    const past = new Date(NOW.getTime() - 1000);
    const cards = {
      [cardKey(1, 'fr-en')]: reviewCard(1, 'fr-en', past),
      [cardKey(2, 'fr-en')]: reviewCard(2, 'fr-en', past),
    };
    const plan = planSession({
      words, api: makeApi(cards),
      filter: [], directions: ['fr-en'], goal: 'unlimited', now: NOW,
    });
    expect(plan.dueCount).toBe(2);
    expect(plan.newAvailable).toBe(1);
  });

  it('returns empty queue when filter excludes all cards', () => {
    const words = [makeWord(1, { pos: 'noun' })];
    const plan = planSession({
      words, api: makeApi(),
      filter: ['verb'], directions: ['fr-en'], goal: 'unlimited', now: NOW,
    });
    expect(plan.queue.length).toBe(0);
  });
});
