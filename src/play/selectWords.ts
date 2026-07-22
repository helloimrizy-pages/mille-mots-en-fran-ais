import type { Word } from '../types';
import type { CardState } from '../flashcards/types';
import { retrievability, seenCards, wordStrength, type Strength } from './strength';
import type { PlayCount, PlaySource } from './types';

export interface SelectPlayWordsInputs {
  source: PlaySource;
  words: Word[];
  cards: Record<string, CardState>;
  selected: Word[];
  buckets: Strength[];
  count: PlayCount;
  now: Date;
}

function take<T>(items: T[], count: PlayCount): T[] {
  return count === 'all' ? items : items.slice(0, count);
}

function earliestDue(seen: CardState[]): number {
  let earliest = Number.POSITIVE_INFINITY;
  for (const card of seen) earliest = Math.min(earliest, new Date(card.due).getTime());
  return earliest;
}

function lowestRetrievability(seen: CardState[], now: Date): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (const card of seen) lowest = Math.min(lowest, retrievability(card, now));
  return lowest;
}

/** How many of these words have at least one card due now or earlier. */
export function countDue(words: Word[], cards: Record<string, CardState>, now: Date): number {
  const nowMs = now.getTime();
  let count = 0;
  for (const word of words) {
    const seen = seenCards(word, cards);
    if (seen.length > 0 && earliestDue(seen) <= nowMs) count++;
  }
  return count;
}

export function selectPlayWords({
  source, words, cards, selected, buckets, count, now,
}: SelectPlayWordsInputs): Word[] {
  if (source === 'selected') return selected;

  if (source === 'new') {
    const fresh = words.filter((word) => seenCards(word, cards).length === 0);
    fresh.sort((a, b) => a.rank - b.rank);
    return take(fresh, count);
  }

  const bucketSet = new Set(buckets);
  const eligible = words.filter((word) => {
    if (seenCards(word, cards).length === 0) return false;
    return bucketSet.size === 0 || bucketSet.has(wordStrength(word, cards, now));
  });

  const nowMs = now.getTime();
  const due: Word[] = [];
  const notDue: Word[] = [];
  for (const word of eligible) {
    if (earliestDue(seenCards(word, cards)) <= nowMs) due.push(word);
    else notDue.push(word);
  }

  due.sort((a, b) => {
    const at = earliestDue(seenCards(a, cards));
    const bt = earliestDue(seenCards(b, cards));
    return at !== bt ? at - bt : a.rank - b.rank;
  });

  notDue.sort((a, b) => {
    const ar = lowestRetrievability(seenCards(a, cards), now);
    const br = lowestRetrievability(seenCards(b, cards), now);
    return ar !== br ? ar - br : a.rank - b.rank;
  });

  return take([...due, ...notDue], count);
}
