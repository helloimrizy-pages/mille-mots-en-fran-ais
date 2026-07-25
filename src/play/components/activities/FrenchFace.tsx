import { Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Word } from '../../../types';

/** The French word rendered as a tap-to-hear button — the prompt in fr-en, the
 *  revealed answer in en-fr. */
export function FrenchFace({ word, onPlay, size }: { word: Word; onPlay: () => void; size: 'lg' | 'sm' }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={cn(
        'flex items-center gap-2 hover:text-emphasis transition-colors',
        size === 'lg' ? 'text-3xl font-semibold' : 'text-xl font-medium',
      )}
      aria-label={`Play pronunciation of ${word.french}`}
    >
      {word.french}
      <Volume2 size={size === 'lg' ? 20 : 16} className="opacity-60" />
    </button>
  );
}
