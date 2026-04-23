import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { PartOfSpeech, Word } from '../../types';
import { cn } from '@/lib/utils';
import { useFlashcardState } from '../useFlashcardState';
import { planSession, type SessionCard } from '../useSession';
import type { Direction, Grade, SessionGoal } from '../types';
import { Card } from './Card';
import { SessionSetup } from './SessionSetup';
import { SessionSummary, type SessionResult } from './SessionSummary';
import { StatsPanel } from './StatsPanel';
import { SettingsPanel } from './SettingsPanel';

interface Props {
  words: Word[];
  open: boolean;
  onClose: () => void;
}

type Tab = 'study' | 'stats' | 'settings';
type StudyState =
  | { kind: 'setup' }
  | { kind: 'session'; queue: SessionCard[]; index: number; result: SessionResult }
  | { kind: 'summary'; result: SessionResult };

function emptyResult(): SessionResult {
  return {
    reviewed: 0,
    byGrade: { 1: 0, 2: 0, 3: 0, 4: 0 },
    startedAt: Date.now(),
    endedAt: 0,
  };
}

export function StudyModal({ words, open, onClose }: Props) {
  const api = useFlashcardState();
  const [tab, setTab] = useState<Tab>('study');
  const [filter, setFilter] = useState<PartOfSpeech[]>(api.settings.lastFilter);
  const [directions, setDirections] = useState<Direction[]>(api.settings.lastDirections);
  const [goal, setGoal] = useState<SessionGoal>(api.settings.lastGoal);
  const [study, setStudy] = useState<StudyState>({ kind: 'setup' });

  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      dialogRef.current?.focus();
    } else if (openerRef.current) {
      openerRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const startSession = () => {
    api.updateSettings({ lastFilter: filter, lastDirections: directions, lastGoal: goal });
    const plan = planSession({ words, api, filter, directions, goal, now: new Date() });
    if (plan.queue.length === 0) return;
    setStudy({ kind: 'session', queue: plan.queue, index: 0, result: emptyResult() });
  };

  const current = useMemo(() => {
    if (study.kind !== 'session') return null;
    const item = study.queue[study.index];
    if (!item) return null;
    const latestCard = api.getCard(item.word.id, item.direction);
    return { ...item, card: latestCard };
  }, [study, api]);

  const handleGrade = (g: Grade) => {
    if (study.kind !== 'session' || !current) return;
    api.grade(current.word.id, current.direction, g, new Date());
    const nextIndex = study.index + 1;
    const result: SessionResult = {
      ...study.result,
      reviewed: study.result.reviewed + 1,
      byGrade: { ...study.result.byGrade, [g]: study.result.byGrade[g] + 1 },
    };
    if (nextIndex >= study.queue.length) {
      setStudy({ kind: 'summary', result: { ...result, endedAt: Date.now() } });
    } else {
      setStudy({ ...study, index: nextIndex, result });
    }
  };

  const backToSetup = () => setStudy({ kind: 'setup' });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-stretch justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Flashcards"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-2xl bg-bg flex flex-col outline-none max-h-screen overflow-hidden"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-1">
            {(['study', 'stats', 'settings'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'text-sm px-3 py-1.5 rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40',
                  tab === t ? 'bg-emphasis text-surface' : 'text-text-muted hover:bg-surface-muted',
                )}
              >
                {t === 'study' ? 'Study' : t === 'stats' ? 'Stats' : 'Settings'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {study.kind === 'session' && tab === 'study' && (
              <div className="text-xs text-text-muted tabular-nums" aria-label="Session progress">
                {study.index + 1} / {study.queue.length}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close flashcards"
              className="p-1.5 rounded-pill text-text-subtle hover:text-text hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="overflow-y-auto flex-1">
          {tab === 'study' && study.kind === 'setup' && (
            <SessionSetup
              words={words}
              filter={filter}
              directions={directions}
              goal={goal}
              onFilterChange={setFilter}
              onDirectionsChange={setDirections}
              onGoalChange={setGoal}
              onStart={startSession}
            />
          )}

          {tab === 'study' && study.kind === 'session' && current && (
            <div className="p-4">
              <div className="h-1 bg-surface-muted rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-emphasis transition-all"
                  style={{ width: `${((study.index) / study.queue.length) * 100}%` }}
                />
              </div>
              <Card
                session={current}
                typedCheckEnabled={api.settings.typedCheck}
                onGrade={handleGrade}
              />
            </div>
          )}

          {tab === 'study' && study.kind === 'summary' && (
            <SessionSummary
              result={study.result}
              onRestart={backToSetup}
              onClose={onClose}
            />
          )}

          {tab === 'stats' && <StatsPanel words={words} />}
          {tab === 'settings' && <SettingsPanel />}
        </div>
      </div>
    </div>
  );
}
