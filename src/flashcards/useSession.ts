import { useMemo } from 'react';
import type { PartOfSpeech, Word } from '../types';
import { cardKey, makeEmptyCard, type CardState, type Direction, type SessionGoal } from './types';
import type { FlashcardApi } from '../contexts/FlashcardContext';

export interface SessionCard {
  word: Word;
  direction: Direction;
  card: CardState;
  isNew: boolean;
}

export interface SessionPlan {
  queue: SessionCard[];
  dueCount: number;
  newAvailable: number;
  goalResolved: number | 'unlimited';
}

export interface SessionInputs {
  words: Word[];
  api: FlashcardApi;
  filter: PartOfSpeech[];
  directions: Direction[];
  goal: SessionGoal;
  now: Date;
}

function resolveDirections(d: Direction[]): Direction[] {
  if (d.length === 0) return ['fr-en', 'en-fr'];
  return d;
}

function shuffleSeeded<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }
  return copy;
}

export function planSession({ words, api, filter, directions, goal, now }: SessionInputs): SessionPlan {
  const dirSet = new Set(resolveDirections(directions));
  const posSet = new Set(filter);
  const matchesPos = (w: Word) => posSet.size === 0 || posSet.has(w.pos);

  const due: SessionCard[] = [];
  const fresh: SessionCard[] = [];

  for (const word of words) {
    if (!matchesPos(word)) continue;
    for (const direction of dirSet) {
      const stored = api.cards[cardKey(word.id, direction)];
      const card = stored ?? makeEmptyCard(word.id, direction, now);
      const isNew = !stored || stored.state === 'new';
      if (isNew) {
        fresh.push({ word, direction, card, isNew: true });
      } else if (new Date(card.due).getTime() <= now.getTime()) {
        due.push({ word, direction, card, isNew: false });
      }
    }
  }

  due.sort((a, b) => {
    const at = new Date(a.card.due).getTime();
    const bt = new Date(b.card.due).getTime();
    if (at !== bt) return at - bt;
    return a.word.rank - b.word.rank;
  });

  const shuffledFresh = shuffleSeeded(fresh).sort((a, b) => a.word.rank - b.word.rank);

  const dailyRemaining = Math.max(0, api.settings.newPerDay - api.daily.newIntroduced);
  const newAvailable = Math.min(shuffledFresh.length, dailyRemaining);
  const dueCount = due.length;

  const goalNum = goal === 'unlimited' ? Number.POSITIVE_INFINITY : goal;

  const dueTake = Math.min(due.length, goalNum);
  const remaining = goalNum === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : goalNum - dueTake;
  const newTake = Math.min(newAvailable, remaining);

  const queue: SessionCard[] = [...due.slice(0, dueTake), ...shuffledFresh.slice(0, newTake)];

  return {
    queue,
    dueCount,
    newAvailable,
    goalResolved: goal === 'unlimited' ? 'unlimited' : goalNum,
  };
}

export function useSession(inputs: SessionInputs): SessionPlan {
  return useMemo(
    () => planSession(inputs),
    // deliberately granular deps so the plan only rebuilds when relevant inputs change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      inputs.words,
      inputs.api.cards,
      inputs.api.settings.newPerDay,
      inputs.api.daily.newIntroduced,
      inputs.api.daily.date,
      inputs.filter.join(','),
      inputs.directions.join(','),
      inputs.goal,
      inputs.now.getTime(),
    ],
  );
}
