import { cn } from '@/lib/utils';
import { ACTIVITY_LABELS, ALL_ACTIVITIES, type ActivityType, type PlaySettings } from '../types';

interface Props {
  wordCount: number;
  settings: PlaySettings;
  onSettingsChange: (s: PlaySettings) => void;
  onStart: () => void;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 text-xs px-3 py-1.5 rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40',
        active ? 'bg-emphasis text-surface' : 'bg-surface text-text-muted hover:bg-surface-muted border border-border',
      )}
    >
      {children}
    </button>
  );
}

export function PlaySetup({ wordCount, settings, onSettingsChange, onStart }: Props) {
  const toggleActivity = (a: ActivityType) => {
    const has = settings.activities.includes(a);
    const next = has ? settings.activities.filter((x) => x !== a) : [...settings.activities, a];
    onSettingsChange({ ...settings, activities: ALL_ACTIVITIES.filter((x) => next.includes(x)) });
  };

  const canStart = wordCount > 0 && settings.activities.length > 0;

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="text-sm text-text-muted">
        {`${wordCount} selected word${wordCount === 1 ? '' : 's'}`}
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Activities</h3>
        <div className="flex flex-wrap gap-1.5">
          {ALL_ACTIVITIES.map((a) => (
            <Chip key={a} active={settings.activities.includes(a)} onClick={() => toggleActivity(a)}>
              {ACTIVITY_LABELS[a]}
            </Chip>
          ))}
        </div>
        <p className="text-[11px] text-text-subtle mt-1.5">Each word is practised with a random mix of the enabled activities.</p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Rounds per word</h3>
        <div className="flex gap-2">
          {([2, 3] as const).map((r) => (
            <Chip key={r} active={settings.repsPerWord === r} onClick={() => onSettingsChange({ ...settings, repsPerWord: r })}>
              {r}
            </Chip>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={onStart}
        disabled={!canStart}
        className="w-full py-3 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
      >
        Start playing
      </button>
    </div>
  );
}
