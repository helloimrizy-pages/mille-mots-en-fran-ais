import { Search } from 'lucide-react';
import { Input } from './ui/input';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function SearchInput({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 bg-surface rounded-lg px-3 py-1.5 shadow-sm">
      <Search size={14} className="text-text-subtle shrink-0" />
      <Input
        aria-label="Search a word"
        placeholder="Search a word…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-0 shadow-none h-8 px-0 focus-visible:ring-0 bg-transparent"
      />
    </div>
  );
}
