import { describe, expect, it } from 'vitest';
import type { Word } from '../types';
import { applyDrill, DRILL_CORRECTS, DRILL_GAP } from './drill';
import type { PlayItem } from './types';

function makeWord(id: number): Word {
  return {
    id, rank: id, french: `mot${id}`, english: `meaning${id}`, pos: 'noun',
    ipa: '/x/', example: { fr: 'Ex.', en: 'Ex.' }, audio: { word: 'w.mp3', sentence: 's.mp3' },
  };
}

const item = (id: number): PlayItem => ({ word: makeWord(id), activity: 'type', direction: 'fr-en' });

/** A queue of ten distinct single-item words. */
const queue = Array.from({ length: 10 }, (_, i) => item(i + 1));

describe('applyDrill', () => {
  it('requeues a missed word and makes it owe two corrects', () => {
    const r = applyDrill(queue, 0, {}, item(1), false);
    expect(r.pending[1]).toBe(DRILL_CORRECTS);
    expect(r.queue).toHaveLength(queue.length + 1);
    expect(r.queue[DRILL_GAP]?.word.id).toBe(1);
    expect(r.queue[DRILL_GAP]?.drill).toBe(true);
  });

  it('retires the word after two corrects, requeueing only for the first', () => {
    const missed = applyDrill(queue, 0, {}, item(1), false);

    const first = applyDrill(missed.queue, 3, missed.pending, item(1), true);
    expect(first.pending[1]).toBe(1);
    expect(first.queue).toHaveLength(missed.queue.length + 1);

    const second = applyDrill(first.queue, 6, first.pending, item(1), true);
    expect(second.pending).not.toHaveProperty('1');
    expect(second.queue).toHaveLength(first.queue.length);
  });

  it('resets the count to two when a repeat is missed', () => {
    const missed = applyDrill(queue, 0, {}, item(1), false);
    const partial = applyDrill(missed.queue, 3, missed.pending, item(1), true);
    expect(partial.pending[1]).toBe(1);

    const again = applyDrill(partial.queue, 6, partial.pending, item(1), false);
    expect(again.pending[1]).toBe(DRILL_CORRECTS);
    expect(again.queue).toHaveLength(partial.queue.length + 1);
  });

  it('does nothing when a word with no pending count is answered correctly', () => {
    const r = applyDrill(queue, 0, {}, item(1), true);
    expect(r.pending).toEqual({});
    expect(r.queue).toBe(queue);
  });

  it('appends rather than dropping when the miss is near the end', () => {
    const r = applyDrill(queue, queue.length - 1, {}, item(10), false);
    expect(r.queue).toHaveLength(queue.length + 1);
    expect(r.queue.at(-1)?.word.id).toBe(10);
  });

  it('tracks words independently', () => {
    const a = applyDrill(queue, 0, {}, item(1), false);
    const b = applyDrill(a.queue, 1, a.pending, item(2), false);
    expect(b.pending).toEqual({ 1: DRILL_CORRECTS, 2: DRILL_CORRECTS });
  });

  it('preserves the activity and direction of the item it repeats', () => {
    const listen: PlayItem = { word: makeWord(4), activity: 'listen', direction: 'fr-en' };
    const r = applyDrill(queue, 0, {}, listen, false);
    const repeat = r.queue[DRILL_GAP];
    expect(repeat?.activity).toBe('listen');
    expect(repeat?.direction).toBe('fr-en');
  });

  it('does not mutate the queue or pending map it is given', () => {
    const pending = {};
    const before = [...queue];
    applyDrill(queue, 0, pending, item(1), false);
    expect(queue).toEqual(before);
    expect(pending).toEqual({});
  });
});
