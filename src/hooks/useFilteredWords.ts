import { useMemo } from 'react';
import type { PartOfSpeech, Word } from '../types';

export type SortMode = 'rank' | 'alpha';
export type PosFilter = PartOfSpeech | 'all';

export interface Filters {
  search: string;
  pos: PosFilter;
  sort: SortMode;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function useFilteredWords(words: Word[], filters: Filters): Word[] {
  return useMemo(() => {
    const q = normalize(filters.search.trim());

    const filtered = words.filter((w) => {
      if (filters.pos !== 'all' && w.pos !== filters.pos) return false;
      if (q.length === 0) return true;
      return normalize(w.french).includes(q) || normalize(w.english).includes(q);
    });

    if (filters.sort === 'alpha') {
      return [...filtered].sort((a, b) => a.french.localeCompare(b.french, 'fr'));
    }
    return [...filtered].sort((a, b) => a.rank - b.rank);
  }, [words, filters.search, filters.pos, filters.sort]);
}
