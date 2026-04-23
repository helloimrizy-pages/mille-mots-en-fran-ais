import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card as FsrsCard } from 'ts-fsrs';
import type { CardLifecycle, CardState, Direction, Grade } from './types';

const STATE_TO_LIFECYCLE: Record<number, CardLifecycle> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const LIFECYCLE_TO_STATE: Record<CardLifecycle, number> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const GRADE_TO_RATING: Record<Grade, number> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

function toFsrs(card: CardState): FsrsCard {
  const base: FsrsCard = {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: 0,
    state: LIFECYCLE_TO_STATE[card.state] as State,
  };
  if (card.lastReview) base.last_review = new Date(card.lastReview);
  return base;
}

function fromFsrs(fsrsCard: FsrsCard, wordId: number, direction: Direction): CardState {
  return {
    wordId,
    direction,
    stability: fsrsCard.stability,
    difficulty: fsrsCard.difficulty,
    elapsedDays: fsrsCard.elapsed_days,
    scheduledDays: fsrsCard.scheduled_days,
    reps: fsrsCard.reps,
    lapses: fsrsCard.lapses,
    state: STATE_TO_LIFECYCLE[fsrsCard.state as number] ?? 'new',
    lastReview: fsrsCard.last_review ? new Date(fsrsCard.last_review).toISOString() : null,
    due: new Date(fsrsCard.due).toISOString(),
  };
}

export interface GradeResult {
  card: CardState;
  intervalDays: number;
}

export interface SchedulerOptions {
  requestRetention?: number;
}

function buildScheduler(options: SchedulerOptions) {
  const params = generatorParameters({
    request_retention: options.requestRetention ?? 0.9,
    enable_fuzz: false,
  });
  return fsrs(params);
}

function pickResult(results: unknown, rating: number): { card: FsrsCard } {
  const map = results as Record<number, { card: FsrsCard } | undefined>;
  const entry = map[rating];
  if (!entry) throw new Error(`No scheduling result for rating ${rating}`);
  return entry;
}

export function gradeCard(
  card: CardState,
  grade: Grade,
  now: Date,
  options: SchedulerOptions = {},
): GradeResult {
  const scheduler = buildScheduler(options);
  const fsrsInput = card.state === 'new'
    ? createEmptyCard(now)
    : toFsrs(card);
  const results = scheduler.repeat(fsrsInput, now);
  const result = pickResult(results, GRADE_TO_RATING[grade]);
  const nextCard = fromFsrs(result.card, card.wordId, card.direction);
  return { card: nextCard, intervalDays: result.card.scheduled_days };
}

export interface IntervalPreview {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export function previewIntervals(
  card: CardState,
  now: Date,
  options: SchedulerOptions = {},
): IntervalPreview {
  const scheduler = buildScheduler(options);
  const fsrsInput = card.state === 'new'
    ? createEmptyCard(now)
    : toFsrs(card);
  const results = scheduler.repeat(fsrsInput, now);
  const intervalForGrade = (grade: Grade): number => {
    const r = pickResult(results, GRADE_TO_RATING[grade]);
    const dueMs = new Date(r.card.due).getTime() - now.getTime();
    return Math.max(0, dueMs / (1000 * 60 * 60 * 24));
  };
  return {
    again: intervalForGrade(1),
    hard: intervalForGrade(2),
    good: intervalForGrade(3),
    easy: intervalForGrade(4),
  };
}

export function formatInterval(days: number): string {
  if (days < 1 / 24 / 60) return '<1m';
  if (days < 1 / 24) {
    const mins = Math.round(days * 24 * 60);
    return `${mins}m`;
  }
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours}h`;
  }
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}
