import { useEffect, useReducer, useState } from 'react';
import { TopBar } from './components/TopBar';
import { WordList } from './components/WordList';
import { useFilteredWords, type PosFilter, type SortMode } from './hooks/useFilteredWords';
import { usePreferences } from './hooks/usePreferences';
import type { Word } from './types';

interface FilterState { search: string; pos: PosFilter; sort: SortMode; }
type FilterAction =
  | { type: 'search'; value: string }
  | { type: 'pos'; value: PosFilter }
  | { type: 'sort'; value: SortMode };

function filterReducer(s: FilterState, a: FilterAction): FilterState {
  switch (a.type) {
    case 'search': return { ...s, search: a.value };
    case 'pos': return { ...s, pos: a.value };
    case 'sort': return { ...s, sort: a.value };
  }
}

export default function App() {
  const { hideTranslation } = usePreferences();
  const [words, setWords] = useState<Word[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, dispatch] = useReducer(filterReducer, { search: '', pos: 'all', sort: 'rank' });
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch('/words.json')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<Word[]>; })
      .then(setWords)
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useFilteredWords(words ?? [], filters);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen max-w-2xl mx-auto">
      <TopBar
        search={filters.search}
        pos={filters.pos}
        sort={filters.sort}
        onSearchChange={(v) => dispatch({ type: 'search', value: v })}
        onPosChange={(v) => dispatch({ type: 'pos', value: v })}
        onSortChange={(v) => dispatch({ type: 'sort', value: v })}
        resultCount={filtered.length}
      />
      <main className="px-4 py-4">
        {error && <div className="p-4 text-red-700 bg-red-50 rounded">Failed to load words: {error}</div>}
        {!error && words === null && <div className="p-4 text-text-muted">Loading…</div>}
        {!error && words !== null && (
          <WordList
            words={filtered}
            expandedIds={expandedIds}
            hideTranslation={hideTranslation}
            onToggleExpand={toggleExpand}
            onPlayWord={(w) => console.log('play', w.french)}
            onPlaySentence={(w) => console.log('sentence', w.french)}
            currentPlayingWordId={null}
            currentPlayingSentenceId={null}
          />
        )}
      </main>
    </div>
  );
}
