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
  newPerDay: number;
  requestRetention: number;
  typedCheck: boolean;
  lastGoal: SessionGoal;
  lastFilter: PartOfSpeech[];
  lastDirections: Direction[];
}

export interface DailyCounter {
  date: string;
  newIntroduced: number;
}

export interface StoredBlob {
  version: 1;
  cards: Record<string, CardState>;
  log: ReviewLogEntry[];
  settings: StudySettings;
  daily: DailyCounter;
}

export const GRADE_LABELS: Record<Grade, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

export const DEFAULT_SETTINGS: StudySettings = {
  newPerDay: 20,
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

export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
