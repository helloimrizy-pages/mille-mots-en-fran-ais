import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredWords } from './useFilteredWords';
import type { Word } from '../types';

const words: Word[] = [
  { id: 1, rank: 3, french: 'avoir', english: 'to have', pos: 'verb', ipa: '', example: { fr: '', en: '' }, audio: { word: '', sentence: '' } },
  { id: 2, rank: 1, french: 'être', english: 'to be', pos: 'verb', ipa: '', example: { fr: '', en: '' }, audio: { word: '', sentence: '' } },
  { id: 3, rank: 2, french: 'livre', english: 'book', pos: 'noun', gender: 'm', ipa: '', example: { fr: '', en: '' }, audio: { word: '', sentence: '' } },
  { id: 4, rank: 5, french: 'maison', english: 'house', pos: 'noun', gender: 'f', ipa: '', example: { fr: '', en: '' }, audio: { word: '', sentence: '' } },
  { id: 5, rank: 4, french: 'petit', english: 'small', pos: 'adjective', ipa: '', example: { fr: '', en: '' }, audio: { word: '', sentence: '' } },
];

describe('useFilteredWords', () => {
  it('returns all words sorted by rank when no filters', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: '', pos: 'all', sort: 'rank' }));
    expect(result.current.map(w => w.id)).toEqual([2, 3, 1, 5, 4]);
  });

  it('sorts alphabetically by french', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: '', pos: 'all', sort: 'alpha' }));
    expect(result.current.map(w => w.french)).toEqual(['avoir', 'être', 'livre', 'maison', 'petit']);
  });

  it('filters by part of speech', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: '', pos: 'noun', sort: 'rank' }));
    expect(result.current.map(w => w.id)).toEqual([3, 4]);
  });

  it('searches french text case- and accent-insensitively', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: 'ETR', pos: 'all', sort: 'rank' }));
    expect(result.current.map(w => w.french)).toEqual(['être']);
  });

  it('searches english text', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: 'house', pos: 'all', sort: 'rank' }));
    expect(result.current.map(w => w.french)).toEqual(['maison']);
  });

  it('combines search and pos filter', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: 'small', pos: 'adjective', sort: 'rank' }));
    expect(result.current.map(w => w.french)).toEqual(['petit']);
  });

  it('returns empty list when nothing matches', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: 'xyz', pos: 'all', sort: 'rank' }));
    expect(result.current).toEqual([]);
  });
});
