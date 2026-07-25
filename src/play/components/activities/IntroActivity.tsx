import { useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { useAudio } from '../../../hooks/useAudio';
import type { IntroProps } from '../../types';
import { FrenchFace } from './FrenchFace';

/**
 * The un-graded first look at a word the user has never studied: french, audio,
 * meaning and example, all shown at once. Nothing is asked and nothing is
 * scheduled — the questions about this word follow it in the queue.
 */
export function IntroActivity({ item, onNext }: IntroProps) {
  const { word } = item;
  const audio = useAudio();
  const playWord = () => audio.play(`w-${word.id}`, word.audio.word);

  useEffect(() => {
    audio.play(`w-${word.id}`, word.audio.word);
    // play once when the word changes; audio is a stable shared player
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id]);

  return (
    <div className="flex flex-col gap-5">
      <div className="min-h-[200px] flex flex-col items-center justify-center bg-surface rounded-card border border-border p-6 text-center">
        <div className="text-[11px] uppercase tracking-wide text-text-subtle mb-3">New word</div>

        <FrenchFace word={word} onPlay={playWord} size="lg" />
        <div className="mt-2 text-sm text-text-subtle font-mono">{word.ipa}</div>

        <div className="mt-5 pt-5 border-t border-border w-full flex flex-col items-center">
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
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full py-3 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
      >
        Got it →
      </button>
    </div>
  );
}
