import { useMemo } from 'react';
import { ALL_POS, POS_LABEL, type PartOfSpeech } from '../../types';
import type { Word } from '../../types';
import { cn } from '@/lib/utils';
import { useFlashcardState } from '../useFlashcardState';
import { planSession } from '../useSession';
import type { Direction, SessionGoal } from '../types';

interface Props {
  words: Word[];
  filter: PartOfSpeech[];
  directions: Direction[];
  goal: SessionGoal;
  onFilterChange: (v: PartOfSpeech[]) => void;
  onDirectionsChange: (v: Direction[]) => void;
  onGoalChange: (v: SessionGoal) => void;
  onStart: () => void;
}

const GOALS: SessionGoal[] = [10, 20, 50, 'unlimited'];
const DIRS: { key: Direction; label: string }[] = [
  { key: 'fr-en', label: 'FR → EN' },
  { key: 'en-fr', label: 'EN → FR' },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 text-xs px-3 py-1.5 rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40',
        active
          ? 'bg-emphasis text-surface'
          : 'bg-surface text-text-muted hover:bg-surface-muted border border-border',
      )}
    >
      {children}
    </button>
  );
}

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function SessionSetup({
  words, filter, directions, goal,
  onFilterChange, onDirectionsChange, onGoalChange, onStart,
}: Props) {
  const api = useFlashcardState();
  const plan = useMemo(
    () => planSession({ words, api, filter, directions, goal, now: new Date() }),
    [words, api, filter, directions, goal],
  );

  const drawn = plan.queue.length;
  const canStart = drawn > 0;

  return (
    <div className="flex flex-col gap-6 p-4">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Direction</h3>
        <div className="flex gap-2">
          {DIRS.map(({ key, label }) => (
            <Chip
              key={key}
              active={directions.length === 0 || directions.includes(key)}
              onClick={() => {
                const current = directions.length === 0 ? ['fr-en', 'en-fr'] as Direction[] : directions;
                const next = toggle(current, key);
                onDirectionsChange(next);
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
        <p className="text-[11px] text-text-subtle mt-1.5">Pick one or both. Each direction is a separate card.</p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Word types</h3>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={filter.length === 0} onClick={() => onFilterChange([])}>All</Chip>
          {ALL_POS.map((p) => (
            <Chip
              key={p}
              active={filter.includes(p)}
              onClick={() => onFilterChange(toggle(filter, p))}
            >
              {POS_LABEL[p]}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Session goal</h3>
        <div className="flex gap-2">
          {GOALS.map((g) => (
            <Chip key={String(g)} active={goal === g} onClick={() => onGoalChange(g)}>
              {g === 'unlimited' ? 'Unlimited' : g}
            </Chip>
          ))}
        </div>
      </section>

      <div className="rounded-md bg-surface-muted p-3 text-sm text-text-muted">
        <div>
          <strong className="text-text">{plan.dueCount}</strong> due ·
          <strong className="text-text"> {plan.newAvailable}</strong> new available
        </div>
        <div className="mt-1 text-xs">
          {drawn > 0
            ? `This session will draw ${drawn} card${drawn === 1 ? '' : 's'}.`
            : 'No cards match — try widening the filter, or add more new words (check Settings).'}
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={!canStart}
        className="w-full py-3 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
      >
        Start session
      </button>
    </div>
  );
}
