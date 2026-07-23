import { describe, expect, it } from 'vitest';
import type { CardState } from '../flashcards/types';
import { retrievability } from './strength';
import { EASY_RETRIEVABILITY_BELOW, gradeForActivity, shouldSchedule } from './grading';

const NOW = new Date('2026-07-23T12:00:00Z');
const MS_PER_DAY = 86_400_000;

function card(overrides: Partial<CardState> = {}): CardState {
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

function newCard(): CardState {
  return card({ state: 'new', lastReview: null, stability: 0 });
}

describe('gradeForActivity', () => {
  it('grades a wrong answer as Again for every activity', () => {
    for (const a of ['choice', 'listen', 'type', 'flashcard'] as const) {
      expect(gradeForActivity(a, false, card(), NOW)).toBe(1);
    }
  });

  it('grades a correct multiple-choice answer as Hard', () => {
    expect(gradeForActivity('choice', true, card(), NOW)).toBe(2);
  });

  it('grades a correct listen answer as Good', () => {
    expect(gradeForActivity('listen', true, card(), NOW)).toBe(3);
  });

  it('grades a correct typed answer as Good while recall is still strong', () => {
    // Reviewed just now → retrievability ~1, comfortably above the Easy line.
    const c = card({ lastReview: NOW.toISOString() });
    expect(retrievability(c, NOW)).toBeGreaterThan(EASY_RETRIEVABILITY_BELOW);
    expect(gradeForActivity('type', true, c, NOW)).toBe(3);
  });

  it('grades a correct typed answer as Easy when recalled after meaningful decay', () => {
    // Stability 10, reviewed 90 days ago → retrievability well below 0.8.
    const c = card({ stability: 10, lastReview: new Date(NOW.getTime() - 90 * MS_PER_DAY).toISOString() });
    expect(retrievability(c, NOW)).toBeLessThanOrEqual(EASY_RETRIEVABILITY_BELOW);
    expect(gradeForActivity('type', true, c, NOW)).toBe(4);
  });

  it('never grades a brand-new typed card as Easy', () => {
    // A new card has no lastReview; retrievability reads 0, which must NOT be
    // mistaken for "well past due" — a first correct answer is Good, not Easy.
    expect(gradeForActivity('type', true, newCard(), NOW)).toBe(3);
  });

  it('exposes the Easy threshold as a probability between 0 and 1', () => {
    expect(EASY_RETRIEVABILITY_BELOW).toBeGreaterThan(0);
    expect(EASY_RETRIEVABILITY_BELOW).toBeLessThan(1);
  });
});

describe('shouldSchedule', () => {
  it('schedules a brand-new card (first play is its initial review)', () => {
    expect(shouldSchedule(newCard(), NOW)).toBe(true);
  });

  it('schedules a card that is due now or earlier', () => {
    const due = card({ due: new Date(NOW.getTime() - MS_PER_DAY).toISOString() });
    expect(shouldSchedule(due, NOW)).toBe(true);
  });

  it('schedules a card due exactly now', () => {
    const due = card({ due: NOW.toISOString() });
    expect(shouldSchedule(due, NOW)).toBe(true);
  });

  it('does NOT schedule a card played before its due date (early practice)', () => {
    const notDue = card({ due: new Date(NOW.getTime() + 5 * MS_PER_DAY).toISOString() });
    expect(shouldSchedule(notDue, NOW)).toBe(false);
  });
});
