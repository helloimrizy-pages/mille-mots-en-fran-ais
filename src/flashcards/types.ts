import type { PartOfSpeech } from '../types';

export type Direction = 'fr-en' | 'en-fr';
export type Grade = 1 | 2 | 3 | 4;

export type CardLifecycle = 'new' | 'learning' | 'review' | 'relearning';

export interface CardState {
  wordId: number;
  direction: Direction;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: CardLifecycle;
  lastReview: string | null;
  due: string;
}

export interface ReviewLogEntry {
  wordId: number;
  direction: Direction;
  grade: Grade;
  reviewedAt: string;
  elapsedDays: number;
  scheduledDays: number;
  state: CardLifecycle;
}

export type SessionGoal = 10 | 20 | 50 | 'unlimited';

export interface StudySettings {
  requestRetention: number;
  typedCheck: boolean;
  lastGoal: SessionGoal;
  lastFilter: PartOfSpeech[];
  lastDirections: Direction[];
}

export interface StoredBlob {
  version: 2;
  cards: Record<string, CardState>;
  log: ReviewLogEntry[];
  settings: StudySettings;
}

export const GRADE_LABELS: Record<Grade, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

export const DEFAULT_SETTINGS: StudySettings = {
  requestRetention: 0.9,
  typedCheck: false,
  lastGoal: 20,
  lastFilter: [],
  lastDirections: [],
};

export const MAX_LOG_ENTRIES = 1000;

export function cardKey(wordId: number, direction: Direction): string {
  return `${wordId}:${direction}`;
}

export function makeEmptyCard(wordId: number, direction: Direction, now: Date = new Date()): CardState {
  return {
    wordId,
    direction,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    lastReview: null,
    due: now.toISOString(),
  };
}
