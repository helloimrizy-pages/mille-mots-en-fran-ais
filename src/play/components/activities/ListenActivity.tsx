import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useAudio } from '../../../hooks/useAudio';
import { cn } from '@/lib/utils';
import type { ActivityProps } from '../../types';

export function ListenActivity({ item, onResult }: ActivityProps) {
  const { word, choices = [] } = item;
  const audio = useAudio();
  const [picked, setPicked] = useState<number | null>(null);
  const decided = picked !== null;

  useEffect(() => {
    audio.play(`w-${word.id}`, word.audio.word);
    // play once when the word changes; audio is a stable shared player
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id]);

  return (
    <div className="flex flex-col gap-5">
      <div className="min-h-[140px] flex flex-col items-center justify-center bg-surface rounded-card border border-border p-6 text-center">
        <button
          type="button"
          onClick={() => audio.play(`w-${word.id}`, word.audio.word)}
          className="flex flex-col items-center gap-2 text-text-muted hover:text-emphasis transition-colors"
          aria-label="Replay audio"
        >
          <Volume2 size={40} />
          <span className="text-xs">Tap to replay</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {choices.map((c) => {
          const isCorrect = c.id === word.id;
          const isPicked = picked === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => { if (!decided) setPicked(c.id); }}
              disabled={decided}
              className={cn(
                'py-3 px-4 rounded-md border text-left transition-colors',
                !decided && 'bg-surface border-border hover:bg-surface-muted',
                decided && isCorrect && 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700',
                decided && isPicked && !isCorrect && 'bg-red-500/10 border-red-500/40 text-red-700',
                decided && !isCorrect && !isPicked && 'bg-surface border-border opacity-60',
              )}
            >
              {c.english}
            </button>
          );
        })}
      </div>

      {decided && (
        <button
          type="button"
          onClick={() => onResult({ correct: picked === word.id })}
          className="w-full py-3 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
        >
          Next →
        </button>
      )}
    </div>
  );
}
