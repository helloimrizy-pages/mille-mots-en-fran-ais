import type { PlayResult } from '../types';

interface Props {
  result: PlayResult;
  onReplay: () => void;
  onClose: () => void;
}

export function PlaySummary({ result, onReplay, onClose }: Props) {
  const answered = result.total;
  const pct = answered === 0 ? 0 : Math.round((result.correct / answered) * 100);
  const seconds = Math.max(0, Math.round((result.endedAt - result.startedAt) / 1000));

  return (
    <div className="flex flex-col gap-5 p-6 text-center">
      <div>
        <h2 className="text-xl font-semibold">Session complete</h2>
        <p className="text-text-muted text-sm mt-1">
          {answered} answer{answered === 1 ? '' : 's'} in {Math.floor(seconds / 60)}m {seconds % 60}s
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface rounded-md border border-border py-3 px-2">
          <div className="text-[11px] text-text-subtle">Correct</div>
          <div className="text-xl font-semibold mt-1 text-emerald-600">{result.correct}</div>
        </div>
        <div className="bg-surface rounded-md border border-border py-3 px-2">
          <div className="text-[11px] text-text-subtle">Wrong</div>
          <div className="text-xl font-semibold mt-1 text-red-600">{result.wrong}</div>
        </div>
        <div className="bg-surface rounded-md border border-border py-3 px-2">
          <div className="text-[11px] text-text-subtle">Best streak</div>
          <div className="text-xl font-semibold mt-1">{result.streakMax}</div>
        </div>
      </div>

      <div className="text-sm text-text-muted">
        <strong className="text-text">{pct}%</strong> correct
        {result.practiced > 0 && <span> · {result.practiced} practised · schedule unchanged</span>}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReplay}
          className="flex-1 py-2.5 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90"
        >
          Play again
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-md border border-border hover:bg-surface-muted"
        >
          Done
        </button>
      </div>
    </div>
  );
}
