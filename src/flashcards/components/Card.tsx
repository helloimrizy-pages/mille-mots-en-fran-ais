import { useEffect, useMemo, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { POS_LABEL } from '../../types';
import { useAudio } from '../../hooks/useAudio';
import { previewIntervals } from '../fsrs';
import type { Grade } from '../types';
import type { SessionCard } from '../useSession';
import { GradeButtons } from './GradeButtons';
import { TypedAnswer, isTypedAnswerCorrect } from './TypedAnswer';
import { cn } from '@/lib/utils';

interface Props {
  session: SessionCard;
  typedCheckEnabled: boolean;
  onGrade: (grade: Grade) => void;
}

export function Card({ session, typedCheckEnabled, onGrade }: Props) {
  const { word, direction, card } = session;
  const audio = useAudio();
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState('');
  const [typedResult, setTypedResult] = useState<'correct' | 'wrong' | null>(null);

  useEffect(() => {
    setFlipped(false);
    setTyped('');
    setTypedResult(null);
  }, [session]);

  const preview = useMemo(() => previewIntervals(card, new Date()), [card]);
  const highlight: Grade | null = typedResult === 'correct' ? 3 : typedResult === 'wrong' ? 1 : null;

  const flip = () => setFlipped(true);
  const submitTyped = () => {
    const expected = direction === 'en-fr' ? word.french : word.english;
    const ok = isTypedAnswerCorrect(typed, expected);
    setTypedResult(ok ? 'correct' : 'wrong');
    setFlipped(true);
  };

  const handleGrade = (g: Grade) => onGrade(g);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!flipped) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          flip();
        }
        return;
      }
      if (e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        handleGrade(Number(e.key) as Grade);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped]);

  const frontIsFrench = direction === 'fr-en';

  return (
    <div className="flex flex-col gap-5">
      <div className="min-h-[200px] flex flex-col items-center justify-center bg-surface rounded-card border border-border p-6 text-center">
        {frontIsFrench ? (
          <>
            <button
              type="button"
              onClick={() => audio.play(`w-${word.id}`, word.audio.word)}
              className="flex items-center gap-2 text-3xl font-semibold hover:text-emphasis transition-colors"
              aria-label={`Play pronunciation of ${word.french}`}
            >
              {word.french}
              <Volume2 size={20} className="opacity-60" />
            </button>
            <div className="mt-2 text-sm text-text-subtle font-mono">{word.ipa}</div>
          </>
        ) : (
          <>
            <div className="text-2xl font-medium">{word.english}</div>
            <div className="mt-2 text-xs text-text-subtle uppercase tracking-wide">{POS_LABEL[word.pos]}</div>
          </>
        )}

        {flipped && (
          <div className="mt-5 pt-5 border-t border-border w-full">
            {frontIsFrench ? (
              <div className="text-xl">{word.english}</div>
            ) : (
              <button
                type="button"
                onClick={() => audio.play(`w-${word.id}`, word.audio.word)}
                className="flex items-center gap-2 text-2xl font-semibold mx-auto hover:text-emphasis transition-colors"
                aria-label={`Play pronunciation of ${word.french}`}
              >
                {word.french}
                <Volume2 size={20} className="opacity-60" />
              </button>
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

      {!flipped ? (
        <div className="flex flex-col gap-3">
          {typedCheckEnabled && (
            <TypedAnswer
              value={typed}
              onChange={setTyped}
              onSubmit={submitTyped}
              placeholder={direction === 'en-fr' ? 'Type in French…' : 'Type in English…'}
            />
          )}
          <button
            type="button"
            onClick={flip}
            className="w-full py-3 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
          >
            Show answer <span className="opacity-60 text-xs ml-1">(Space)</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {typedResult && (
            <div className={cn(
              'text-center text-sm py-2 rounded-md',
              typedResult === 'correct' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600',
            )}>
              {typedResult === 'correct' ? 'Correct — confirm your grade' : 'Not quite — confirm your grade'}
            </div>
          )}
          <GradeButtons preview={preview} onGrade={handleGrade} highlight={highlight} />
        </div>
      )}
    </div>
  );
}
