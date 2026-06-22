import type { Word } from '../types';

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

export function pickDistractors(
  answer: Word,
  pool: Word[],
  n: number,
  rng: () => number = Math.random,
): Word[] {
  const candidates = pool.filter((w) => w.id !== answer.id);
  const samePos = shuffle(candidates.filter((w) => w.pos === answer.pos), rng);
  const otherPos = shuffle(candidates.filter((w) => w.pos !== answer.pos), rng);
  return [...samePos, ...otherPos].slice(0, n);
}
