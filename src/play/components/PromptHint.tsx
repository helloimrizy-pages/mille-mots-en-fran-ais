import type { Word } from '../../types';
import type { ConjugationData } from '../../hooks/useConjugations';
import { clozeSentence, grammarHint } from '../prompt';

interface Props {
  word: Word;
  // Explicit `undefined` because callers forward an optional prop straight
  // through, and exactOptionalPropertyTypes distinguishes that from omitting it.
  conj: ConjugationData | null | undefined;
  /**
   * Whether to show the cloze. Only meaningful when the prompt is English and
   * the answer is French — in the other direction the French word is already
   * on screen, so a blanked French sentence would say nothing.
   */
  showCloze: boolean;
}

/**
 * Says which word the prompt actually means. A fifth of the word list shares an
 * English gloss with something else — "have" is any of ai/as/avez/avons/ont —
 * so without this an English→French prompt can be genuinely unanswerable.
 */
export function PromptHint({ word, conj, showCloze }: Props) {
  const hint = grammarHint(word, conj ?? null);
  const cloze = showCloze ? clozeSentence(word) : null;
  if (!hint && !cloze) return null;

  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      {hint && (
        <span className="text-[11px] px-2 py-[2px] rounded-pill bg-surface-muted text-text-muted">
          {hint}
        </span>
      )}
      {cloze && (
        <div className="text-sm text-text-muted italic">“{cloze}”</div>
      )}
    </div>
  );
}
