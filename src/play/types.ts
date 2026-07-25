import type { Word } from '../types';
import type { Direction, Grade } from '../flashcards/types';
import type { ConjugationData } from '../hooks/useConjugations';
import type { Strength } from './strength';

/** The activities the user can enable, and the only ones that produce a grade. */
export type AnswerableActivity = 'flashcard' | 'choice' | 'type' | 'listen';

/**
 * Everything that can occupy a queue slot. `intro` is the un-graded card that
 * teaches a never-studied word — french, audio, meaning and example — before
 * that word's first question. It is emitted by buildPlayQueue, never chosen by
 * the user, so it stays out of ALL_ACTIVITIES and PlaySettings.
 */
export type ActivityType = AnswerableActivity | 'intro';

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
  /**
   * A repetition requeued after the word was missed. Shown and tallied like any
   * other item, but never allowed to touch the FSRS schedule — the original miss
   * already graded the card, and drilling it should not grade it again.
   */
  drill?: boolean;
}

export interface PlaySettings {
  activities: AnswerableActivity[];
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
  /**
   * Conjugation tables, used to label which form of a verb the prompt means.
   * Optional and nullable: it loads lazily, and without it the prompt simply
   * renders as it did before.
   */
  conj?: ConjugationData | null;
}

/** The intro card reports nothing — it only advances the queue. */
export interface IntroProps {
  item: PlayItem;
  onNext: () => void;
  conj?: ConjugationData | null;
}

export const ALL_ACTIVITIES: AnswerableActivity[] = ['flashcard', 'choice', 'type', 'listen'];

export const ACTIVITY_LABELS: Record<AnswerableActivity, string> = {
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
