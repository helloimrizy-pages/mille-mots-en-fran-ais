import { SearchInput } from './SearchInput';
import { FilterChips } from './FilterChips';
import { SortMenu } from './SortMenu';
import { DarkModeToggle } from './DarkModeToggle';
import { HideTranslationToggle } from './HideTranslationToggle';
import { DueBadge } from '../flashcards/components/DueBadge';
import { SyncStatusDot } from '../sync/components/SyncStatusDot';
import type { PosFilter, SortMode } from '../hooks/useFilteredWords';
import { cn } from '@/lib/utils';

interface Props {
  search: string;
  pos: PosFilter;
  sort: SortMode;
  onSearchChange: (v: string) => void;
  onPosChange: (v: PosFilter) => void;
  onSortChange: (v: SortMode) => void;
  resultCount: number;
  onOpenStudy: () => void;
  onOpenAccount: () => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
}

export function TopBar({ search, pos, sort, onSearchChange, onPosChange, onSortChange, resultCount, onOpenStudy, onOpenAccount, selectMode, onToggleSelectMode }: Props) {
  return (
    <div className="sticky top-0 z-10 bg-bg/90 backdrop-blur-md px-4 py-4 border-b border-border">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <div className="font-bold text-lg leading-tight">Mille Mots</div>
          <div className="text-[11px] text-text-subtle">
            {resultCount === 1 ? '1 word' : `${resultCount} words`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSelectMode}
            aria-pressed={selectMode}
            className={cn(
              'text-xs px-3 py-1.5 rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40',
              selectMode ? 'bg-emphasis text-surface' : 'text-text-muted hover:bg-surface-muted border border-border',
            )}
          >
            {selectMode ? 'Done' : 'Select'}
          </button>
          <SyncStatusDot onClick={onOpenAccount} />
          <DueBadge onClick={onOpenStudy} />
          <SortMenu value={sort} onChange={onSortChange} />
          <DarkModeToggle />
          <HideTranslationToggle />
        </div>
      </div>
      <div className="mb-2"><SearchInput value={search} onChange={onSearchChange} /></div>
      <FilterChips value={pos} onChange={onPosChange} />
    </div>
  );
}
