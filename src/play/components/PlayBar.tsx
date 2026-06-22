import { Play } from 'lucide-react';

interface Props {
  count: number;
  onSelectAll: () => void;
  onClear: () => void;
  onPlay: () => void;
}

export function PlayBar({ count, onSelectAll, onClear, onPlay }: Props) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-30 flex justify-center pointer-events-none">
      <div className="m-3 w-full max-w-2xl pointer-events-auto rounded-card border border-border bg-bg/95 backdrop-blur-md shadow-lg px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-sm text-text-muted tabular-nums">
          <strong className="text-text">{count}</strong> selected
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs px-3 py-1.5 rounded-pill text-text-muted hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={count === 0}
            className="text-xs px-3 py-1.5 rounded-pill text-text-muted hover:bg-surface-muted disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onPlay}
            disabled={count === 0}
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-pill bg-emphasis text-surface font-medium hover:bg-emphasis/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
          >
            <Play size={14} /> Play
          </button>
        </div>
      </div>
    </div>
  );
}
