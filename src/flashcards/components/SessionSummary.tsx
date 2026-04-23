import type { Grade } from '../types';

export interface SessionResult {
  reviewed: number;
  byGrade: Record<Grade, number>;
  startedAt: number;
  endedAt: number;
}

interface Props {
  result: SessionResult;
  onRestart: () => void;
  onClose: () => void;
}

export function SessionSummary({ result, onRestart, onClose }: Props) {
  const total = result.reviewed;
  const goodPlus = result.byGrade[3] + result.byGrade[4];
  const pct = total === 0 ? 0 : Math.round((goodPlus / total) * 100);
  const seconds = Math.round((result.endedAt - result.startedAt) / 1000);

  return (
    <div className="flex flex-col gap-5 p-6 text-center">
      <div>
        <h2 className="text-xl font-semibold">Session complete</h2>
        <p className="text-text-muted text-sm mt-1">
          {total} card{total === 1 ? '' : 's'} reviewed in {Math.floor(seconds / 60)}m {seconds % 60}s
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {([1, 2, 3, 4] as Grade[]).map((g) => (
          <div key={g} className="bg-surface rounded-md border border-border py-3 px-2">
            <div className="text-[11px] text-text-subtle">
              {g === 1 ? 'Again' : g === 2 ? 'Hard' : g === 3 ? 'Good' : 'Easy'}
            </div>
            <div className="text-xl font-semibold mt-1">{result.byGrade[g]}</div>
          </div>
        ))}
      </div>

      <div className="text-sm text-text-muted">
        <strong className="text-text">{pct}%</strong> Good or Easy
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="flex-1 py-2.5 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90"
        >
          Start another
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-md border border-border hover:bg-surface-muted"
        >
          Close
        </button>
      </div>
    </div>
  );
}
