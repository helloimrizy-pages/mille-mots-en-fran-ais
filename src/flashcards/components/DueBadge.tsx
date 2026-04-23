import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlashcardState } from '../useFlashcardState';

interface Props {
  onClick: () => void;
}

export function DueBadge({ onClick }: Props) {
  const { dueCount } = useFlashcardState();
  const n = dueCount();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={n > 0 ? `Study — ${n} due` : 'Study'}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40',
        n > 0
          ? 'bg-emphasis text-surface hover:bg-emphasis/90'
          : 'bg-surface text-text-muted hover:bg-surface-muted',
      )}
    >
      <BookOpen size={14} />
      <span>Study{n > 0 ? ` · ${n}` : ''}</span>
    </button>
  );
}
