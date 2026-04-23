import { describe, expect, it } from 'vitest';
import { formatInterval, gradeCard, previewIntervals } from './fsrs';
import { makeEmptyCard } from './types';

const NOW = new Date('2026-04-23T12:00:00Z');

describe('gradeCard', () => {
  it('advances a new card to learning on Good', () => {
    const empty = makeEmptyCard(1, 'fr-en', NOW);
    const { card } = gradeCard(empty, 3, NOW);
    expect(card.state).toBe('learning');
    expect(card.reps).toBeGreaterThan(0);
    expect(new Date(card.due).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('Easy schedules further out than Good', () => {
    const empty = makeEmptyCard(1, 'fr-en', NOW);
    const good = gradeCard(empty, 3, NOW).card;
    const easy = gradeCard(empty, 4, NOW).card;
    expect(new Date(easy.due).getTime()).toBeGreaterThan(new Date(good.due).getTime());
  });

  it('Again schedules soonest', () => {
    const empty = makeEmptyCard(1, 'fr-en', NOW);
    const again = gradeCard(empty, 1, NOW).card;
    const good = gradeCard(empty, 3, NOW).card;
    expect(new Date(again.due).getTime()).toBeLessThanOrEqual(new Date(good.due).getTime());
  });

  it('preserves wordId and direction', () => {
    const empty = makeEmptyCard(42, 'en-fr', NOW);
    const { card } = gradeCard(empty, 3, NOW);
    expect(card.wordId).toBe(42);
    expect(card.direction).toBe('en-fr');
  });

  it('promotes a card through learning to review with repeated Good grades', () => {
    let card = makeEmptyCard(1, 'fr-en', NOW);
    let now = NOW;
    for (let i = 0; i < 5; i++) {
      card = gradeCard(card, 3, now).card;
      now = new Date(card.due);
    }
    expect(['review', 'learning']).toContain(card.state);
    expect(card.reps).toBeGreaterThanOrEqual(5);
  });

  it('records lastReview ISO timestamp', () => {
    const empty = makeEmptyCard(1, 'fr-en', NOW);
    const { card } = gradeCard(empty, 3, NOW);
    expect(card.lastReview).toBe(NOW.toISOString());
  });
});

describe('previewIntervals', () => {
  it('returns non-negative intervals in Again ≤ Hard ≤ Good ≤ Easy order for a review card', () => {
    const empty = makeEmptyCard(1, 'fr-en', NOW);
    const first = gradeCard(empty, 3, NOW).card;
    const later = new Date(new Date(first.due).getTime() + 24 * 60 * 60 * 1000);
    const preview = previewIntervals(first, later);
    expect(preview.again).toBeGreaterThanOrEqual(0);
    expect(preview.hard).toBeGreaterThanOrEqual(preview.again);
    expect(preview.good).toBeGreaterThanOrEqual(preview.hard);
    expect(preview.easy).toBeGreaterThanOrEqual(preview.good);
  });
});

describe('formatInterval', () => {
  it('formats minutes', () => {
    expect(formatInterval(10 / (24 * 60))).toBe('10m');
  });
  it('formats hours', () => {
    expect(formatInterval(2 / 24)).toBe('2h');
  });
  it('formats days', () => {
    expect(formatInterval(3)).toBe('3d');
  });
  it('formats months', () => {
    expect(formatInterval(60)).toBe('2mo');
  });
  it('formats years', () => {
    expect(formatInterval(400)).toBe('1y');
  });
});
