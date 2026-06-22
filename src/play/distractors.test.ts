import { describe, expect, it } from 'vitest';
import type { Word } from '../types';
import { pickDistractors } from './distractors';

function makeWord(id: number, overrides: Partial<Word> = {}): Word {
  return {
    id, rank: id, french: `mot${id}`, english: `meaning${id}`, pos: 'noun',
    ipa: '/test/', example: { fr: 'Ex.', en: 'Ex.' }, audio: { word: 'w.mp3', sentence: 's.mp3' },
    ...overrides,
  };
}

describe('pickDistractors', () => {
  const pool = Array.from({ length: 8 }, (_, i) => makeWord(i + 1));

  it('returns n distractors excluding the answer', () => {
    const answer = pool[0]!;
    const result = pickDistractors(answer, pool, 3, () => 0);
    expect(result).toHaveLength(3);
    expect(result.some((w) => w.id === answer.id)).toBe(false);
  });

  it('has no duplicates', () => {
    const result = pickDistractors(pool[0]!, pool, 3, () => 0);
    expect(new Set(result.map((w) => w.id)).size).toBe(result.length);
  });

  it('prefers same part of speech', () => {
    const answer = makeWord(100, { pos: 'verb' });
    const mixed = [makeWord(101, { pos: 'verb' }), ...Array.from({ length: 5 }, (_, i) => makeWord(200 + i, { pos: 'noun' }))];
    const result = pickDistractors(answer, mixed, 1, () => 0);
    expect(result[0]!.pos).toBe('verb');
  });

  it('returns fewer when the pool is too small', () => {
    const tiny = [makeWord(1), makeWord(2)];
    const result = pickDistractors(tiny[0]!, tiny, 3, () => 0);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(2);
  });
});
