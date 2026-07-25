import type { PlayItem } from './types';

/** Consecutive correct answers a word owes after it has been missed. */
export const DRILL_CORRECTS = 2;
/** How many items to wait before asking a missed word again. */
export const DRILL_GAP = 3;

/** How many correct answers each word still owes, keyed by word id. */
export type DrillPending = Record<number, number>;

export interface DrillState {
  queue: PlayItem[];
  pending: DrillPending;
}

function reinsert(queue: PlayItem[], index: number, item: PlayItem): PlayItem[] {
  const next = [...queue];
  // Far enough ahead that there is something to forget, clamped so a miss near
  // the end of the queue still gets appended rather than dropped.
  next.splice(Math.min(index + DRILL_GAP, next.length), 0, { ...item, drill: true });
  return next;
}

/**
 * Requeues a missed word until it has been answered correctly twice in a row.
 *
 * A miss always resets the count, so missing a repeat restarts the two. The
 * requeued copy is flagged `drill` — PlayModal shows and tallies it but never
 * lets it touch the FSRS schedule, so one card still produces at most one
 * review-log entry per session.
 */
export function applyDrill(
  queue: PlayItem[],
  index: number,
  pending: DrillPending,
  item: PlayItem,
  correct: boolean,
): DrillState {
  const id = item.word.id;

  if (!correct) {
    return {
      queue: reinsert(queue, index, item),
      pending: { ...pending, [id]: DRILL_CORRECTS },
    };
  }

  const owed = pending[id] ?? 0;
  if (owed === 0) return { queue, pending };

  const left = owed - 1;
  if (left === 0) {
    const cleared = { ...pending };
    delete cleared[id];
    return { queue, pending: cleared };
  }

  return {
    queue: reinsert(queue, index, item),
    pending: { ...pending, [id]: left },
  };
}
