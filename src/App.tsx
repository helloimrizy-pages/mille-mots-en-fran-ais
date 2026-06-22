import { useEffect, useReducer, useState } from 'react';
import { TopBar } from './components/TopBar';
import { WordList } from './components/WordList';
import { StudyModal } from './flashcards/components/StudyModal';
import { PlayModal } from './play/components/PlayModal';
import { PlayBar } from './play/components/PlayBar';
import { useAudio } from './hooks/useAudio';
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
  const audio = useAudio();
  const [words, setWords] = useState<Word[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, dispatch] = useReducer(filterReducer, { search: '', pos: 'all', sort: 'rank' });
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [studyOpen, setStudyOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [playOpen, setPlayOpen] = useState(false);

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

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedWords = (words ?? []).filter((w) => selectedIds.has(w.id));

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
        onOpenStudy={() => setStudyOpen(true)}
        selectMode={selectMode}
        onToggleSelectMode={() => {
          setSelectMode((m) => !m);
          if (selectMode) setSelectedIds(new Set());
        }}
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
            onPlayWord={(w) => { audio.play(`w-${w.id}`, w.audio.word); }}
            onPlaySentence={(w) => { audio.play(`s-${w.id}`, w.audio.sentence); }}
            currentPlayingWordId={
              words?.find((w) => audio.isPlaying(`w-${w.id}`))?.id ?? null
            }
            currentPlayingSentenceId={
              words?.find((w) => audio.isPlaying(`s-${w.id}`))?.id ?? null
            }
            {...(selectMode ? { selectMode: true } : {})}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        )}
      </main>
      {selectMode && (
        <PlayBar
          count={selectedIds.size}
          onSelectAll={() => setSelectedIds(new Set(filtered.map((w) => w.id)))}
          onClear={() => setSelectedIds(new Set())}
          onPlay={() => setPlayOpen(true)}
        />
      )}
      <PlayModal
        selected={selectedWords}
        pool={words ?? []}
        open={playOpen}
        onClose={() => setPlayOpen(false)}
      />
      <StudyModal
        words={words ?? []}
        open={studyOpen}
        onClose={() => setStudyOpen(false)}
      />
    </div>
  );
}
