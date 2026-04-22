import { ChevronDown } from 'lucide-react';
import { POS_LABEL, type Word } from '../types';
import { WordRowExpanded } from './WordRowExpanded';
import { cn } from '@/lib/utils';

interface Props {
  word: Word;
  expanded: boolean;
  hideTranslation: boolean;
  onPlayWord: () => void;
  onPlaySentence: () => void;
  onToggleExpand: () => void;
  isWordPlaying?: boolean;
  isSentencePlaying?: boolean;
}

const POS_TAG_CLASS: Record<Word['pos'], string> = {
  noun: 'bg-tag-noun-bg text-tag-noun-fg',
  verb: 'bg-tag-verb-bg text-tag-verb-fg',
  adjective: 'bg-tag-adj-bg text-tag-adj-fg',
  adverb: 'bg-tag-adv-bg text-tag-adv-fg',
  pronoun: 'bg-tag-pron-bg text-tag-pron-fg',
  conjunction: 'bg-tag-conj-bg text-tag-conj-fg',
  preposition: 'bg-tag-prep-bg text-tag-prep-fg',
};

const GENDER_TAG_CLASS = {
  m: 'bg-tag-m-bg text-tag-m-fg',
  f: 'bg-tag-f-bg text-tag-f-fg',
  mf: 'bg-tag-mf-bg text-tag-mf-fg',
} as const;

export function WordRow(props: Props) {
  const { word, expanded, hideTranslation, onPlayWord, onPlaySentence, onToggleExpand, isWordPlaying, isSentencePlaying } = props;

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <button
            type="button"
            aria-label={`Play pronunciation of ${word.french}`}
            onClick={(e) => { e.stopPropagation(); onPlayWord(); }}
            className={cn(
              'text-base font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40 rounded',
              isWordPlaying && 'text-emphasis',
            )}
          >
            {word.french}
          </button>
          <span className={cn('text-sm text-text-muted truncate', hideTranslation && 'blur-sm hover:blur-none transition-[filter]')}>
            {word.english}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-[11px] px-2 py-[2px] rounded-pill', POS_TAG_CLASS[word.pos])}>
            {POS_LABEL[word.pos].toLowerCase()}
          </span>
          {word.gender && (
            <span className={cn('text-[11px] px-2 py-[2px] rounded-pill', GENDER_TAG_CLASS[word.gender])}>
              {word.gender}
            </span>
          )}
          <ChevronDown
            size={14}
            className={cn('text-text-subtle transition-transform', expanded && 'rotate-180')}
          />
        </div>
      </div>
      {expanded && (
        <WordRowExpanded
          word={word}
          hideTranslation={hideTranslation}
          onPlayWord={onPlayWord}
          onPlaySentence={onPlaySentence}
          {...(isSentencePlaying !== undefined ? { isSentencePlaying } : {})}
        />
      )}
    </div>
  );
}
