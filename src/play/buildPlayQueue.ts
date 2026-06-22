import type { Word } from '../types';
import type { Direction } from '../flashcards/types';
import { pickDistractors } from './distractors';
import type { ActivityType, PlayItem, PlaySettings } from './types';

export interface BuildPlayQueueInputs {
  selected: Word[];
  pool: Word[];
  settings: PlaySettings;
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

function directionFor(activity: ActivityType, rng: () => number): Direction {
  if (activity === 'flashcard' || activity === 'listen') return 'fr-en';
  return rng() < 0.5 ? 'fr-en' : 'en-fr';
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

export function buildPlayQueue({ selected, pool, settings, rng = Math.random }: BuildPlayQueueInputs): PlayItem[] {
  const enabled = settings.activities.length > 0 ? settings.activities : (['flashcard'] as ActivityType[]);
  const items: PlayItem[] = [];

  for (const word of selected) {
    for (const activity of pickActivities(enabled, settings.repsPerWord, rng)) {
      const direction = directionFor(activity, rng);
      const item: PlayItem = { word, activity, direction };
      if (activity === 'choice' || activity === 'listen') {
        item.choices = shuffle([word, ...pickDistractors(word, pool, 3, rng)], rng);
      }
      items.push(item);
    }
  }

  return spreadByWord(shuffle(items, rng));
}
