import { useState } from 'react';
import { WordList } from './components/WordList';
import { SEED_WORDS } from './seed-data';

export default function App() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Mille Mots</h1>
      <WordList
        words={SEED_WORDS}
        expandedIds={expanded}
        hideTranslation={false}
        onToggleExpand={(id) => setExpanded(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id); else next.add(id);
          return next;
        })}
        onPlayWord={(w) => console.log('play', w.french)}
        onPlaySentence={(w) => console.log('sentence', w.french)}
        currentPlayingWordId={null}
        currentPlayingSentenceId={null}
      />
    </div>
  );
}
