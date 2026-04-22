import { ALL_POS, POS_LABEL, type PartOfSpeech } from '../types';
import type { PosFilter } from '../hooks/useFilteredWords';
import { cn } from '@/lib/utils';

interface Props {
  value: PosFilter;
  onChange: (v: PosFilter) => void;
}

export function FilterChips({ value, onChange }: Props) {
  const chips: Array<{ key: PosFilter; label: string }> = [
    { key: 'all', label: 'All' },
    ...ALL_POS.map<{ key: PartOfSpeech; label: string }>((p) => ({ key: p, label: POS_LABEL[p] })),
  ];

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1" role="tablist" aria-label="Filter by part of speech">
      {chips.map(({ key, label }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={cn(
              'shrink-0 text-xs px-3 py-1 rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40',
              active
                ? 'bg-emphasis text-surface'
                : 'bg-surface text-text-muted hover:bg-surface-muted',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
