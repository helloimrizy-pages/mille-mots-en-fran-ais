import { ChevronDown, ArrowDownAZ, Hash } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from './ui/dropdown-menu';
import type { SortMode } from '../hooks/useFilteredWords';

interface Props {
  value: SortMode;
  onChange: (v: SortMode) => void;
}

const LABEL: Record<SortMode, string> = { alpha: 'A–Z', rank: 'Frequency' };

export function SortMenu({ value, onChange }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 text-xs px-3 py-1 rounded-pill bg-surface text-text-muted hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40">
        {LABEL[value]}
        <ChevronDown size={12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onChange('alpha')}>
          <ArrowDownAZ size={14} className="mr-2" /> A–Z
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange('rank')}>
          <Hash size={14} className="mr-2" /> Frequency
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
