import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Word } from '../../types';
import { useFlashcardState } from '../../flashcards/useFlashcardState';
import { buildPlayQueue } from '../buildPlayQueue';
import { loadPlaySettings, savePlaySettings } from '../playStorage';
import { countDue, selectPlayWords } from '../selectWords';
import { bucketCounts, type Strength } from '../strength';
import { emptyPlayResult, type PlayItem, type PlayOutcome, type PlayResult, type PlaySettings, type PlaySource } from '../types';
import { FlashcardActivity } from './activities/FlashcardActivity';
import { MultipleChoiceActivity } from './activities/MultipleChoiceActivity';
import { TypeActivity } from './activities/TypeActivity';
import { ListenActivity } from './activities/ListenActivity';
import { PlaySetup, type SetupPreview } from './PlaySetup';
import { PlaySummary } from './PlaySummary';

interface Props {
  /** The full word list — the pool for both source selection and distractors. */
  words: Word[];
  selected: Word[];
  open: boolean;
  onClose: () => void;
  /** When set, the source is fixed and its picker is hidden. */
  forceSource?: PlaySource;
}

type PlayState =
  | { kind: 'setup' }
  | { kind: 'session'; queue: PlayItem[]; index: number; streak: number; result: PlayResult }
  | { kind: 'summary'; result: PlayResult };

const EMPTY_BUCKET_COUNTS: Record<Strength, number> = {
  'new': 0, 'almost-forgotten': 0, 'just-seen': 0,
  'shaky': 0, 'getting-solid': 0, 'solid': 0,
};

function renderActivity(item: PlayItem, onResult: (o: PlayOutcome) => void) {
  switch (item.activity) {
    case 'flashcard': return <FlashcardActivity item={item} onResult={onResult} />;
    case 'choice': return <MultipleChoiceActivity item={item} onResult={onResult} />;
    case 'type': return <TypeActivity item={item} onResult={onResult} />;
    case 'listen': return <ListenActivity item={item} onResult={onResult} />;
  }
}

export function PlayModal({ words, selected, open, onClose, forceSource }: Props) {
  const api = useFlashcardState();
  const [settings, setSettings] = useState<PlaySettings>(() => loadPlaySettings());
  const [state, setState] = useState<PlayState>({ kind: 'setup' });

  const source = forceSource ?? settings.source;

  // Recomputed on every settings change so the setup screen's counts and empty
  // states always describe the session that Start would actually begin. Only
  // worth doing while the setup screen is actually on screen: measured at
  // 0.32ms on a fresh deck but 9.47ms on a fully studied 999-word corpus, and
  // App renders PlayModal unconditionally, so an unconditional memo redoes
  // this work on every App re-render (every search-box keystroke) even while
  // the modal is closed, and again after every graded answer mid-session. The
  // hook itself must stay unconditional — the gate lives inside the callback.
  const preview = useMemo<SetupPreview>(() => {
    if (!open || state.kind !== 'setup') {
      return { words: [], dueCount: 0, counts: EMPTY_BUCKET_COUNTS, selectedCount: selected.length };
    }
    // `now` is deliberately not a dependency: a setup screen left open across
    // a due boundary shows slightly stale counts until the next settings tap,
    // which is accepted rather than driven by a timer.
    const now = new Date();
    const resolved = selectPlayWords({
      source,
      words,
      cards: api.cards,
      selected,
      buckets: settings.buckets,
      count: settings.wordCount,
      now,
    });
    return {
      words: resolved,
      dueCount: countDue(resolved, api.cards, now),
      counts: bucketCounts(words, api.cards, now),
      selectedCount: selected.length,
    };
  }, [open, state.kind, source, words, api.cards, selected, settings.buckets, settings.wordCount]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      dialogRef.current?.focus();
      setState({ kind: 'setup' });
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

  const start = () => {
    savePlaySettings(settings);
    const queue = buildPlayQueue({ selected: preview.words, pool: words, settings, cards: api.cards });
    if (queue.length === 0) return;
    setState({ kind: 'session', queue, index: 0, streak: 0, result: emptyPlayResult(Date.now()) });
  };

  const handleResult = (outcome: PlayOutcome) => {
    if (state.kind !== 'session') return;
    const item = state.queue[state.index];
    if (!item) return;

    if (outcome !== 'exposed') {
      api.grade(item.word.id, item.direction, outcome === 'correct' ? 3 : 1, new Date());
    }

    const streak = outcome === 'correct' ? state.streak + 1 : 0;
    const result: PlayResult = {
      ...state.result,
      correct: state.result.correct + (outcome === 'correct' ? 1 : 0),
      wrong: state.result.wrong + (outcome === 'wrong' ? 1 : 0),
      exposed: state.result.exposed + (outcome === 'exposed' ? 1 : 0),
      total: state.result.total + (outcome === 'exposed' ? 0 : 1),
      streakMax: Math.max(state.result.streakMax, streak),
    };

    const nextIndex = state.index + 1;
    if (nextIndex >= state.queue.length) {
      setState({ kind: 'summary', result: { ...result, endedAt: Date.now() } });
    } else {
      setState({ kind: 'session', queue: state.queue, index: nextIndex, streak, result });
    }
  };

  if (!open) return null;

  const current = state.kind === 'session' ? state.queue[state.index] : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-stretch justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Play"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-2xl bg-bg flex flex-col outline-none max-h-screen overflow-hidden"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="font-semibold">Play</div>
          <div className="flex items-center gap-3">
            {state.kind === 'session' && (
              <>
                <div className="text-xs text-text-muted tabular-nums">
                  {state.result.correct} correct{state.streak > 1 ? ` · 🔥${state.streak}` : ''}
                </div>
                <div className="text-xs text-text-muted tabular-nums" aria-label="Session progress">
                  {state.index + 1} / {state.queue.length}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close play"
              className="p-1.5 rounded-pill text-text-subtle hover:text-text hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="overflow-y-auto flex-1">
          {state.kind === 'setup' && (
            <PlaySetup
              settings={settings}
              onSettingsChange={setSettings}
              onStart={start}
              preview={preview}
              {...(forceSource ? { forceSource } : {})}
            />
          )}

          {state.kind === 'session' && current && (
            <div className="p-4">
              <div className="h-1 bg-surface-muted rounded-full overflow-hidden mb-4">
                <div className="h-full bg-emphasis transition-all" style={{ width: `${(state.index / state.queue.length) * 100}%` }} />
              </div>
              <div key={state.index}>
                {renderActivity(current, handleResult)}
              </div>
            </div>
          )}

          {state.kind === 'summary' && (
            <PlaySummary result={state.result} onReplay={() => setState({ kind: 'setup' })} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
