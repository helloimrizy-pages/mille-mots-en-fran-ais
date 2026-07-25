import { retrievability } from './strength';
import type { CardState, Grade } from '../flashcards/types';
import type { AnswerableActivity } from './types';

// A due card whose predicted recall has decayed to this or below counts as
// "well past due": recalling it by typing there is strong evidence and earns
// Easy instead of Good. Tunable.
export const EASY_RETRIEVABILITY_BELOW = 0.8;

/**
 * Whether an answer should update the FSRS schedule. A brand-new word's first
 * play is its initial review (there's no schedule to disturb), and a genuinely
 * due card is a real review — both update. A card played before its due date is
 * early practice: shown but left alone, so Play never reschedules early reviews.
 */
export function shouldSchedule(card: CardState, now: Date): boolean {
  if (card.state === 'new') return true;
  return new Date(card.due).getTime() <= now.getTime();
}

/**
 * Maps a correct/incorrect answer to an FSRS grade by how much retrieval the
 * activity demanded: recognition (multiple choice) is the weakest evidence,
 * production (typing) the strongest. A wrong answer is always Again.
 *
 * Flashcard is not really graded here — the user self-grades it — but it maps
 * to Good if ever routed through, so the switch is total.
 */
export function gradeForActivity(
  activity: AnswerableActivity,
  correct: boolean,
  card: CardState,
  now: Date,
): Grade {
  if (!correct) return 1; // Again

  switch (activity) {
    case 'choice':
      return 2; // Hard — recognition, one of four
    case 'listen':
      return 3; // Good — audio recognition, harder to parse than reading
    case 'type':
      // Easy only when the card had meaningfully decayed and was still recalled.
      // A new card has no lastReview, so retrievability() returns 0; guarding on
      // lastReview stops that from reading as "overdue" and handing out Easy.
      if (card.lastReview && retrievability(card, now) <= EASY_RETRIEVABILITY_BELOW) return 4; // Easy
      return 3; // Good
    case 'flashcard':
      return 3; // Good — flashcard normally self-grades; total-switch fallback.
  }
}
