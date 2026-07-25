import { cn } from '@/lib/utils';
import type { Word } from '../../types';
import { REVIEW_STRENGTHS, STRENGTH_LABELS, type Strength } from '../strength';
import {
  ACTIVITY_LABELS,
  ALL_ACTIVITIES,
  ALL_COUNTS,
  SOURCE_LABELS,
  type AnswerableActivity,
  type PlayCount,
  type PlaySettings,
  type PlaySource,
} from '../types';

export interface SetupPreview {
  /** The words this session would actually play, already resolved. */
  words: Word[];
  /** How many of those words have a card due now or earlier. */
  dueCount: number;
  counts: Record<Strength, number>;
  selectedCount: number;
}

interface Props {
  settings: PlaySettings;
  onSettingsChange: (s: PlaySettings) => void;
  onStart: () => void;
  preview: SetupPreview;
  /** When set, the source is fixed and its picker is hidden. */
  forceSource?: PlaySource;
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

function countLabel(count: PlayCount): string {
  return count === 'all' ? 'All' : String(count);
}

function emptyMessage(settings: PlaySettings, source: PlaySource): string {
  if (source === 'selected') return 'Select some words to play.';
  if (source === 'new') return "You've seen every word. Try Review.";
  if (settings.buckets.length > 0) return 'No words in the selected strengths.';
  return 'Nothing to review yet — play some new words first.';
}

// Returns a fragment rather than a wrapper element: the caller's <div> must be
// the only node whose textContent is the summary, or getByText matches both the
// wrapper and the inner element and throws "found multiple elements".
function summary(settings: PlaySettings, source: PlaySource, preview: SetupPreview): React.ReactNode {
  const count = preview.words.length;
  if (count === 0) return emptyMessage(settings, source);
  const plural = count === 1 ? '' : 's';
  if (source === 'selected') {
    return <>Playing with <strong className="text-text">{count}</strong> selected word{plural}.</>;
  }
  if (source === 'new') {
    return <>Playing <strong className="text-text">{count}</strong> new word{plural} · {preview.counts.new.toLocaleString()} remaining</>;
  }
  return <>Playing <strong className="text-text">{count}</strong> word{plural} · {preview.dueCount} due, {count - preview.dueCount} topped up</>;
}

export function PlaySetup({ settings, onSettingsChange, onStart, preview, forceSource }: Props) {
  const source = forceSource ?? settings.source;
  const count = preview.words.length;
  const empty = count === 0;

  const sources: PlaySource[] = preview.selectedCount > 0
    ? ['new', 'review', 'selected']
    : ['new', 'review'];

  const toggleActivity = (a: AnswerableActivity) => {
    const has = settings.activities.includes(a);
    const next = has ? settings.activities.filter((x) => x !== a) : [...settings.activities, a];
    onSettingsChange({ ...settings, activities: ALL_ACTIVITIES.filter((x) => next.includes(x)) });
  };

  const toggleBucket = (b: Strength) => {
    const has = settings.buckets.includes(b);
    const next = has ? settings.buckets.filter((x) => x !== b) : [...settings.buckets, b];
    onSettingsChange({ ...settings, buckets: REVIEW_STRENGTHS.filter((x) => next.includes(x)) });
  };

  const canStart = !empty && settings.activities.length > 0;

  return (
    <div className="flex flex-col gap-6 p-4">
      {forceSource === undefined && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Source</h3>
          <div className="flex gap-2">
            {sources.map((s) => (
              <Chip key={s} active={source === s} onClick={() => onSettingsChange({ ...settings, source: s })}>
                {SOURCE_LABELS[s]}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {source !== 'selected' && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Words</h3>
          <div className="flex gap-2">
            {ALL_COUNTS.map((c) => (
              <Chip key={String(c)} active={settings.wordCount === c} onClick={() => onSettingsChange({ ...settings, wordCount: c })}>
                {countLabel(c)}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {source === 'review' && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Strength</h3>
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_STRENGTHS.map((b) => (
              <Chip key={b} active={settings.buckets.includes(b)} onClick={() => toggleBucket(b)}>
                {STRENGTH_LABELS[b]} {preview.counts[b].toLocaleString()}
              </Chip>
            ))}
          </div>
          <p className="text-[11px] text-text-subtle mt-1.5">Tap to narrow the session. Nothing tapped plays every strength.</p>
        </section>
      )}

      <div className="text-sm text-text-muted">{summary(settings, source, preview)}</div>
      {source === 'new' && !empty && (
        <p className="text-[11px] text-text-subtle -mt-4">Each new word is introduced before you're quizzed on it.</p>
      )}

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
