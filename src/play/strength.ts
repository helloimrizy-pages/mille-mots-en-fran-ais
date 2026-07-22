import type { Word } from '../types';
import { cardKey, type CardState, type Direction } from '../flashcards/types';

export type Strength =
  | 'new'
  | 'almost-forgotten'
  | 'just-seen'
  | 'shaky'
  | 'getting-solid'
  | 'solid';

/** Weakest to strongest. Aggregation and display both rely on this order. */
export const STRENGTH_ORDER: Strength[] = [
  'new', 'almost-forgotten', 'just-seen', 'shaky', 'getting-solid', 'solid',
];

/** The buckets Review can filter by — unseen words belong to the New source. */
export const REVIEW_STRENGTHS: Strength[] = STRENGTH_ORDER.filter((s) => s !== 'new');

export const STRENGTH_LABELS: Record<Strength, string> = {
  'new': 'New',
  'almost-forgotten': 'Almost forgotten',
  'just-seen': 'Just seen',
  'shaky': 'Shaky',
  'getting-solid': 'Getting solid',
  'solid': 'Solid',
};

// FSRS-5 forgetting curve. Written out rather than taken from ts-fsrs so the
// maths stays deterministic and directly testable.
const DECAY = -0.5;
const FACTOR = 19 / 81;
const MS_PER_DAY = 86_400_000;
const ALMOST_FORGOTTEN_BELOW = 0.7;

const DIRECTIONS: Direction[] = ['fr-en', 'en-fr'];

/** Predicted probability of recalling this card right now, 0..1. */
export function retrievability(card: CardState, now: Date): number {
  if (!card.lastReview || card.stability <= 0) return 0;
  const elapsedDays = Math.max(0, (now.getTime() - new Date(card.lastReview).getTime()) / MS_PER_DAY);
  return Math.pow(1 + FACTOR * (elapsedDays / card.stability), DECAY);
}

export function cardStrength(card: CardState | undefined, now: Date): Strength {
  if (!card || card.state === 'new') return 'new';
  if (card.state === 'relearning' || retrievability(card, now) < ALMOST_FORGOTTEN_BELOW) return 'almost-forgotten';
  if (card.state === 'learning' || card.stability < 1) return 'just-seen';
  if (card.stability < 7) return 'shaky';
  if (card.stability < 30) return 'getting-solid';
  return 'solid';
}

/** The word's cards that have actually been studied, in either direction. */
export function seenCards(word: Word, cards: Record<string, CardState>): CardState[] {
  const out: CardState[] = [];
  for (const direction of DIRECTIONS) {
    const card = cards[cardKey(word.id, direction)];
    if (card && card.state !== 'new') out.push(card);
  }
  return out;
}

/**
 * Weakest bucket across the word's seen cards. Unseen directions are ignored so
 * that a word with one solid direction and one untouched one still shows up in
 * Review rather than being mislabelled `new`.
 */
export function wordStrength(word: Word, cards: Record<string, CardState>, now: Date): Strength {
  const seen = seenCards(word, cards);
  if (seen.length === 0) return 'new';
  let weakest: Strength = 'solid';
  for (const card of seen) {
    const strength = cardStrength(card, now);
    if (STRENGTH_ORDER.indexOf(strength) < STRENGTH_ORDER.indexOf(weakest)) weakest = strength;
  }
  return weakest;
}

export function bucketCounts(
  words: Word[],
  cards: Record<string, CardState>,
  now: Date,
): Record<Strength, number> {
  const counts = {
    'new': 0, 'almost-forgotten': 0, 'just-seen': 0,
    'shaky': 0, 'getting-solid': 0, 'solid': 0,
  };
  for (const word of words) counts[wordStrength(word, cards, now)]++;
  return counts;
}
