import { Virtuoso } from 'react-virtuoso';
import type { Word } from '../types';
import { WordRow } from './WordRow';

interface Props {
  words: Word[];
  expandedIds: Set<number>;
  hideTranslation: boolean;
  onToggleExpand: (id: number) => void;
  onPlayWord: (word: Word) => void;
  onPlaySentence: (word: Word) => void;
  currentPlayingWordId: number | null;
  currentPlayingSentenceId: number | null;
}

export function WordList(props: Props) {
  const {
    words, expandedIds, hideTranslation,
    onToggleExpand, onPlayWord, onPlaySentence,
    currentPlayingWordId, currentPlayingSentenceId,
  } = props;

  if (words.length === 0) {
    return (
      <div className="py-12 text-center text-text-muted">No words match your filters.</div>
    );
  }

  return (
    <div className="bg-surface rounded-card shadow-sm overflow-hidden">
      <Virtuoso
        useWindowScroll
        data={words}
        computeItemKey={(_, w) => w.id}
        itemContent={(_, word) => (
          <WordRow
            word={word}
            expanded={expandedIds.has(word.id)}
            hideTranslation={hideTranslation}
            onPlayWord={() => onPlayWord(word)}
            onPlaySentence={() => onPlaySentence(word)}
            onToggleExpand={() => onToggleExpand(word.id)}
            isWordPlaying={currentPlayingWordId === word.id}
            isSentencePlaying={currentPlayingSentenceId === word.id}
          />
        )}
      />
    </div>
  );
}
