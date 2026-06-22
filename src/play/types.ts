import type { Word } from '../types';
import type { Direction } from '../flashcards/types';

export type ActivityType = 'flashcard' | 'choice' | 'type' | 'listen';
export type PlayOutcome = 'correct' | 'wrong' | 'exposed';

export interface PlayItem {
  word: Word;
  activity: ActivityType;
  direction: Direction;
  choices?: Word[];
}

export interface PlaySettings {
  activities: ActivityType[];
  repsPerWord: 2 | 3;
}

export interface PlayResult {
  correct: number;
  wrong: number;
  exposed: number;
  total: number;
  streakMax: number;
  startedAt: number;
  endedAt: number;
}

export interface ActivityProps {
  item: PlayItem;
  onResult: (outcome: PlayOutcome) => void;
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
};

export function emptyPlayResult(startedAt: number): PlayResult {
  return { correct: 0, wrong: 0, exposed: 0, total: 0, streakMax: 0, startedAt, endedAt: 0 };
}
