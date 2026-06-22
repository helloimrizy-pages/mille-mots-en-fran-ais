import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useAudio } from '../../../hooks/useAudio';
import type { ActivityProps } from '../../types';

export function FlashcardActivity({ item, onResult }: ActivityProps) {
  const { word } = item;
  const audio = useAudio();
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="min-h-[200px] flex flex-col items-center justify-center bg-surface rounded-card border border-border p-6 text-center">
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

        {revealed && (
          <div className="mt-5 pt-5 border-t border-border w-full">
            <div className="text-xl">{word.english}</div>
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

      <button
        type="button"
        onClick={() => (revealed ? onResult('exposed') : setRevealed(true))}
        className="w-full py-3 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
      >
        {revealed ? 'Got it →' : 'Show meaning'}
      </button>
    </div>
  );
}
