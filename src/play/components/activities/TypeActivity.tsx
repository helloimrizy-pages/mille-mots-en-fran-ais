import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useAudio } from '../../../hooks/useAudio';
import { cn } from '@/lib/utils';
import { TypedAnswer, isTypedAnswerCorrect } from '../../../flashcards/components/TypedAnswer';
import type { ActivityProps } from '../../types';

export function TypeActivity({ item, onResult }: ActivityProps) {
  const { word, direction } = item;
  const audio = useAudio();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null);

  const promptFrench = direction === 'fr-en';
  const expected = promptFrench ? word.english : word.french;

  const submit = () => {
    if (result !== null) return;
    const alternatives = expected.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const ok = alternatives.some((alt) => isTypedAnswerCorrect(value, alt));
    setResult(ok ? 'correct' : 'wrong');
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="min-h-[140px] flex flex-col items-center justify-center bg-surface rounded-card border border-border p-6 text-center">
        {promptFrench ? (
          <button
            type="button"
            onClick={() => audio.play(`w-${word.id}`, word.audio.word)}
            className="flex items-center gap-2 text-3xl font-semibold hover:text-emphasis transition-colors"
            aria-label={`Play pronunciation of ${word.french}`}
          >
            {word.french}
            <Volume2 size={20} className="opacity-60" />
          </button>
        ) : (
          <div className="text-2xl font-medium">{word.english}</div>
        )}

        {result !== null && (
          <div className="mt-4 text-sm">
            <span className={cn(result === 'correct' ? 'text-emerald-600' : 'text-red-600')}>
              {result === 'correct' ? 'Correct ·' : 'Answer:'}
            </span>{' '}
            <span className="font-medium">{expected}</span>
          </div>
        )}
      </div>

      {result === null ? (
        <div className="flex flex-col gap-3">
          <TypedAnswer
            value={value}
            onChange={setValue}
            onSubmit={submit}
            placeholder={promptFrench ? 'Type in English…' : 'Type in French…'}
          />
          <button
            type="button"
            onClick={submit}
            className="w-full py-3 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
          >
            Check
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onResult({ correct: result === 'correct' })}
          className="w-full py-3 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
        >
          Next →
        </button>
      )}
    </div>
  );
}
