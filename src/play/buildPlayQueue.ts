import type { Word } from '../types';
import type { CardState, Direction } from '../flashcards/types';
import { pickDistractors } from './distractors';
import { seenCards } from './strength';
import type { ActivityType, PlayItem, PlaySettings } from './types';

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

function pickActivities(enabled: ActivityType[], reps: number, rng: () => number): ActivityType[] {
  const shuffled = shuffle(enabled, rng);
  const result: ActivityType[] = [];
  for (let i = 0; i < reps; i++) {
    result.push(shuffled[i % shuffled.length] as ActivityType);
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

function directionFor(activity: ActivityType, rng: () => number, studied: Direction[] | null): Direction {
  if (activity === 'flashcard' || activity === 'listen') return 'fr-en';
  if (studied) return studied[Math.floor(rng() * studied.length)] as Direction;
  return rng() < 0.5 ? 'fr-en' : 'en-fr';
}

/**
 * flashcard/listen are hardcoded fr-en (see directionFor), so a word studied
 * only en-fr can't sensibly use them. Drop those two activities for that word
 * only — unless doing so would leave nothing enabled at all, in which case
 * fall back to the full enabled list rather than emitting no items for the
 * word.
 */
function activitiesFor(enabled: ActivityType[], studied: Direction[] | null): ActivityType[] {
  if (!studied || studied.includes('fr-en')) return enabled;
  const filtered = enabled.filter((a) => a !== 'flashcard' && a !== 'listen');
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

export function buildPlayQueue({ selected, pool, settings, cards, rng = Math.random }: BuildPlayQueueInputs): PlayItem[] {
  const enabled = settings.activities.length > 0 ? settings.activities : (['flashcard'] as ActivityType[]);
  const items: PlayItem[] = [];

  for (const word of selected) {
    const studied = studiedDirections(word, cards);
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

  return spreadByWord(shuffle(items, rng));
}
