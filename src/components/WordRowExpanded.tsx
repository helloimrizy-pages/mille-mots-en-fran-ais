import { Play, Volume2 } from 'lucide-react';
import type { Word } from '../types';
import { cn } from '@/lib/utils';

interface Props {
  word: Word;
  hideTranslation: boolean;
  onPlayWord: () => void;
  onPlaySentence: () => void;
  isSentencePlaying?: boolean;
}

export function WordRowExpanded({ word, hideTranslation, onPlayWord, onPlaySentence, isSentencePlaying }: Props) {
  return (
    <div
      className="px-4 pb-4 bg-gradient-to-b from-surface-muted to-surface"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-baseline gap-3 flex-wrap text-sm text-text-muted pt-1">
        <button
          type="button"
          aria-label={`Play pronunciation of ${word.french}`}
          onClick={onPlayWord}
          className="flex items-center gap-1 text-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40 rounded"
        >
          <span className="font-semibold">{word.french}</span>
          <Volume2 size={13} className="text-text-subtle" />
        </button>
        <span className="font-mono text-xs text-text-subtle">[{word.ipa}]</span>
        <span className={cn(hideTranslation && 'blur-sm hover:blur-none transition-[filter]')}>
          — {word.english}
        </span>
      </div>

      <div className="mt-3 rounded-lg bg-bg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-text-subtle">Example</span>
          <button
            type="button"
            onClick={onPlaySentence}
            aria-label="Play example sentence"
            className={cn(
              'flex items-center gap-1 text-[11px] px-2 py-[2px] rounded-pill border border-border bg-surface hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40',
              isSentencePlaying && 'text-emphasis',
            )}
          >
            <Play size={10} /> Play sentence
          </button>
        </div>
        <div className="text-sm font-medium">{word.example.fr}</div>
        <div className={cn('text-sm text-text-muted mt-0.5', hideTranslation && 'blur-sm hover:blur-none transition-[filter]')}>
          {word.example.en}
        </div>
      </div>

      {(word.synonyms?.length || word.plural) && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-text-subtle mr-1">Also:</span>
          {word.plural && (
            <span className="text-[11px] px-2 py-[2px] rounded-pill bg-bg text-text-muted">
              {word.plural} (pl)
            </span>
          )}
          {word.synonyms?.map((s, i) => (
            <span key={i} className="text-[11px] px-2 py-[2px] rounded-pill bg-bg text-text-muted">
              {s.word}{s.note ? ` (${s.note})` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
