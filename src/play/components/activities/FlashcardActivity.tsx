import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useAudio } from '../../../hooks/useAudio';
import { cn } from '@/lib/utils';
import type { Grade } from '../../../flashcards/types';
import type { ActivityProps } from '../../types';
import { FrenchFace } from './FrenchFace';
import { PromptHint } from '../PromptHint';

const GRADES: Array<{ grade: Grade; label: string; className: string }> = [
  { grade: 1, label: 'Again', className: 'bg-red-500/90 hover:bg-red-500 text-white' },
  { grade: 2, label: 'Hard', className: 'bg-amber-500/90 hover:bg-amber-500 text-white' },
  { grade: 3, label: 'Good', className: 'bg-emerald-500/90 hover:bg-emerald-500 text-white' },
  { grade: 4, label: 'Easy', className: 'bg-sky-500/90 hover:bg-sky-500 text-white' },
];

export function FlashcardActivity({ item, onResult, conj }: ActivityProps) {
  const { word, direction } = item;
  const audio = useAudio();
  const [revealed, setRevealed] = useState(false);
  const promptFrench = direction === 'fr-en';
  const playWord = () => audio.play(`w-${word.id}`, word.audio.word);

  return (
    <div className="flex flex-col gap-5">
      <div className="min-h-[200px] flex flex-col items-center justify-center bg-surface rounded-card border border-border p-6 text-center">
        {promptFrench ? (
          <>
            <FrenchFace word={word} onPlay={playWord} size="lg" />
            <div className="mt-2 text-sm text-text-subtle font-mono">{word.ipa}</div>
          </>
        ) : (
          <div className="text-3xl font-semibold">{word.english}</div>
        )}

        <PromptHint word={word} conj={conj} showCloze={!promptFrench} />

        {revealed && (
          <div className="mt-5 pt-5 border-t border-border w-full flex flex-col items-center">
            {promptFrench ? (
              <div className="text-xl">{word.english}</div>
            ) : (
              <>
                <FrenchFace word={word} onPlay={playWord} size="sm" />
                <div className="mt-1 text-xs text-text-subtle font-mono">{word.ipa}</div>
              </>
            )}
            <div className="mt-4 text-sm text-text-muted italic">
              {word.example.fr}
              <button
                type="button"
                onClick={() => audio.play(`s-${word.id}`, word.audio.sentence)}
                className="ml-2 inline-flex align-middle text-text-subtle hover:text-emphasis"
                aria-label="Play example sentence"
              >
                <Volume2 size={14} />
              </button>
            </div>
            <div className="mt-1 text-xs text-text-subtle">{word.example.en}</div>
          </div>
        )}
      </div>

      {revealed ? (
        <div>
          <p className="text-[11px] text-text-subtle text-center mb-2">How well did you know it?</p>
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map(({ grade, label, className }) => (
              <button
                key={grade}
                type="button"
                onClick={() => onResult({ grade })}
                className={cn(
                  'py-3 px-2 rounded-md font-medium text-sm transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40',
                  className,
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="w-full py-3 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
        >
          Show meaning
        </button>
      )}
    </div>
  );
}
