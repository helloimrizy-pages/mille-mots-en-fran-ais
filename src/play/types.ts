import type { Word } from '../types';
import type { Direction, Grade } from '../flashcards/types';
import type { Strength } from './strength';

export type ActivityType = 'flashcard' | 'choice' | 'type' | 'listen';

/**
 * What an activity reports when the user answers. Choice/type/listen report only
 * whether the answer was right — Play maps that to an FSRS grade centrally via
 * `gradeForActivity`. Flashcard reports the user's own self-chosen grade.
 */
export type PlayAnswer =
  | { correct: boolean }
  | { grade: Grade };

export type PlaySource = 'new' | 'review' | 'selected';
export type PlayCount = 10 | 20 | 50 | 'all';

export const ALL_COUNTS: PlayCount[] = [10, 20, 50, 'all'];

export const SOURCE_LABELS: Record<PlaySource, string> = {
  new: 'New',
  review: 'Review',
  selected: 'Selected',
};

export interface PlayItem {
  word: Word;
  activity: ActivityType;
  direction: Direction;
  choices?: Word[];
}

export interface PlaySettings {
  activities: ActivityType[];
  repsPerWord: 2 | 3;
  wordCount: PlayCount;
  source: PlaySource;
  buckets: Strength[];
}

export interface PlayResult {
  correct: number;
  wrong: number;
  /** Answers on not-due cards, where the schedule was deliberately left alone. */
  practiced: number;
  total: number;
  streakMax: number;
  startedAt: number;
  endedAt: number;
}

export interface ActivityProps {
  item: PlayItem;
  onResult: (answer: PlayAnswer) => void;
}

export const ALL_ACTIVITIES: ActivityType[] = ['flashcard', 'choice', 'type', 'listen'];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  flashcard: 'Flashcards',
  choice: 'Multiple choice',
  type: 'Type answer',
  listen: 'Listen',
};

export const DEFAULT_PLAY_SETTINGS: PlaySettings = {
  activities: ['flashcard', 'choice', 'type', 'listen'],
  repsPerWord: 2,
  wordCount: 20,
  source: 'review',
  buckets: [],
};

export function emptyPlayResult(startedAt: number): PlayResult {
  return { correct: 0, wrong: 0, practiced: 0, total: 0, streakMax: 0, startedAt, endedAt: 0 };
}
