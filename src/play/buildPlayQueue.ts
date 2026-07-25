import type { Word } from '../types';
import type { CardState, Direction } from '../flashcards/types';
import { pickDistractors } from './distractors';
import { seenCards } from './strength';
import type { AnswerableActivity, PlayItem, PlaySettings } from './types';

export interface BuildPlayQueueInputs {
  selected: Word[];
  pool: Word[];
  settings: PlaySettings;
  /**
   * Optional so existing callers (and buildPlayQueue.test.ts) keep compiling
   * unchanged. When omitted, direction is chosen exactly as before this fix —
   * randomly, independent of what has actually been studied.
   */
  cards?: Record<string, CardState>;
  rng?: () => number;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }
  return copy;
}

function pickActivities(enabled: AnswerableActivity[], reps: number, rng: () => number): AnswerableActivity[] {
  const shuffled = shuffle(enabled, rng);
  const result: AnswerableActivity[] = [];
  for (let i = 0; i < reps; i++) {
    result.push(shuffled[i % shuffled.length] as AnswerableActivity);
  }
  return result;
}

/**
 * The directions this word has actually been studied in (a card with
 * `state !== 'new'`), or `null` when there is no restriction to apply —
 * either because no `cards` map was supplied, or because the word is
 * genuinely new in both directions.
 */
function studiedDirections(word: Word, cards: Record<string, CardState> | undefined): Direction[] | null {
  if (!cards) return null;
  const directions = seenCards(word, cards).map((c) => c.direction);
  return directions.length > 0 ? directions : null;
}

function directionFor(activity: AnswerableActivity, rng: () => number, studied: Direction[] | null): Direction {
  // Listen's prompt is the French audio, so it can only run fr-en. Flashcard,
  // choice and type all render either direction, so they respect the studied
  // restriction (or pick randomly when the word is new / unrestricted).
  if (activity === 'listen') return 'fr-en';
  if (studied) return studied[Math.floor(rng() * studied.length)] as Direction;
  return rng() < 0.5 ? 'fr-en' : 'en-fr';
}

/**
 * Only listen is fr-en-only (see directionFor), so a word studied only en-fr
 * can't sensibly use it. Drop listen for that word — unless doing so would
 * leave nothing enabled at all, in which case fall back to the full enabled
 * list rather than emitting no items for the word.
 */
function activitiesFor(enabled: AnswerableActivity[], studied: Direction[] | null): AnswerableActivity[] {
  if (!studied || studied.includes('fr-en')) return enabled;
  const filtered = enabled.filter((a) => a !== 'listen');
  return filtered.length > 0 ? filtered : enabled;
}

// Best-effort: avoid the same word landing in adjacent positions.
function spreadByWord(items: PlayItem[]): PlayItem[] {
  const result = [...items];
  for (let i = 1; i < result.length; i++) {
    const prev = result[i - 1]!;
    const cur = result[i]!;
    if (cur.word.id !== prev.word.id) continue;
    for (let j = i + 1; j < result.length; j++) {
      if (result[j]!.word.id !== prev.word.id) {
        result[i] = result[j]!;
        result[j] = cur;
        break;
      }
    }
  }
  return result;
}

/**
 * Puts an un-graded intro card immediately before the first question about each
 * never-studied word, so a word is always taught before it is asked. Runs after
 * the shuffle — spreadByWord only keeps duplicate *questions* apart, and an
 * intro sitting next to its own first question is exactly the intent.
 */
function withIntros(items: PlayItem[], introIds: Set<number>): PlayItem[] {
  if (introIds.size === 0) return items;
  const out: PlayItem[] = [];
  const introduced = new Set<number>();
  for (const item of items) {
    if (introIds.has(item.word.id) && !introduced.has(item.word.id)) {
      introduced.add(item.word.id);
      // Direction is unread for an intro (it shows both sides); fr-en satisfies PlayItem.
      out.push({ word: item.word, activity: 'intro', direction: 'fr-en' });
    }
    out.push(item);
  }
  return out;
}

export function buildPlayQueue({ selected, pool, settings, cards, rng = Math.random }: BuildPlayQueueInputs): PlayItem[] {
  const enabled = settings.activities.length > 0 ? settings.activities : (['flashcard'] as AnswerableActivity[]);
  const items: PlayItem[] = [];
  // Same predicate selectPlayWords uses for the New source, so the two agree on
  // what "new" means. Without a cards map there is no way to tell, so no intros.
  const introIds = new Set<number>();

  for (const word of selected) {
    const studied = studiedDirections(word, cards);
    if (cards && seenCards(word, cards).length === 0) introIds.add(word.id);
    const wordActivities = activitiesFor(enabled, studied);
    for (const activity of pickActivities(wordActivities, settings.repsPerWord, rng)) {
      const direction = directionFor(activity, rng, studied);
      const item: PlayItem = { word, activity, direction };
      if (activity === 'choice' || activity === 'listen') {
        item.choices = shuffle([word, ...pickDistractors(word, pool, 3, rng)], rng);
      }
      items.push(item);
    }
  }

  return withIntros(spreadByWord(shuffle(items, rng)), introIds);
}
