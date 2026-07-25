import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Word } from '../../types';
import { useFlashcardState } from '../../flashcards/useFlashcardState';
import { buildPlayQueue } from '../buildPlayQueue';
import { loadPlaySettings, savePlaySettings } from '../playStorage';
import { countDue, selectPlayWords } from '../selectWords';
import { bucketCounts, type Strength } from '../strength';
import { emptyPlayResult, type PlayAnswer, type PlayItem, type PlayResult, type PlaySettings, type PlaySource } from '../types';
import type { Grade } from '../../flashcards/types';
import { gradeForActivity, shouldSchedule } from '../grading';
import { applyDrill, type DrillPending } from '../drill';
import { useConjugations, type ConjugationData } from '../../hooks/useConjugations';
import { FlashcardActivity } from './activities/FlashcardActivity';
import { MultipleChoiceActivity } from './activities/MultipleChoiceActivity';
import { TypeActivity } from './activities/TypeActivity';
import { ListenActivity } from './activities/ListenActivity';
import { IntroActivity } from './activities/IntroActivity';
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
  | {
      kind: 'session';
      queue: PlayItem[];
      index: number;
      streak: number;
      result: PlayResult;
      /** How many more correct answers each missed word owes. */
      pending: DrillPending;
    }
  | { kind: 'summary'; result: PlayResult };

const EMPTY_BUCKET_COUNTS: Record<Strength, number> = {
  'new': 0, 'almost-forgotten': 0, 'just-seen': 0,
  'shaky': 0, 'getting-solid': 0, 'solid': 0,
};

function renderActivity(
  item: PlayItem,
  onResult: (answer: PlayAnswer) => void,
  onNext: () => void,
  conj: ConjugationData | null,
) {
  switch (item.activity) {
    case 'intro': return <IntroActivity item={item} onNext={onNext} conj={conj} />;
    case 'flashcard': return <FlashcardActivity item={item} onResult={onResult} conj={conj} />;
    case 'choice': return <MultipleChoiceActivity item={item} onResult={onResult} conj={conj} />;
    case 'type': return <TypeActivity item={item} onResult={onResult} conj={conj} />;
    case 'listen': return <ListenActivity item={item} onResult={onResult} />;
  }
}

export function PlayModal({ words, selected, open, onClose, forceSource }: Props) {
  const api = useFlashcardState();
  // Starts loading while the setup screen is up, so the grammar hints are ready
  // long before the first question. Module-cached, so this is free if a verb row
  // was already expanded in the word list.
  const { data: conj } = useConjugations();
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
    setState({ kind: 'session', queue, index: 0, streak: 0, result: emptyPlayResult(Date.now()), pending: {} });
  };

  /**
   * Moves to the next queue item, or to the summary when there is none. `queue`
   * and `pending` are passed in rather than read from the session, because a
   * missed word grows the queue as part of the very answer being handled.
   */
  const advance = (
    session: Extract<PlayState, { kind: 'session' }>,
    streak: number,
    result: PlayResult,
    queue: PlayItem[] = session.queue,
    pending: DrillPending = session.pending,
  ) => {
    const nextIndex = session.index + 1;
    if (nextIndex >= queue.length) {
      setState({ kind: 'summary', result: { ...result, endedAt: Date.now() } });
    } else {
      setState({ kind: 'session', queue, index: nextIndex, streak, result, pending });
    }
  };

  // An intro is exposure, not an answer: no grade is written, and the streak and
  // the result tallies pass through untouched so the summary's answer count stays
  // honest.
  const handleIntroDone = () => {
    if (state.kind !== 'session') return;
    advance(state, state.streak, state.result);
  };

  const handleResult = (answer: PlayAnswer) => {
    if (state.kind !== 'session') return;
    const item = state.queue[state.index];
    if (!item) return;
    // Intro cards report through onNext, never here. The guard also narrows
    // item.activity to the answerable set that gradeForActivity accepts.
    if (item.activity === 'intro') return;

    const now = new Date();
    // Read the card as it stands *before* this answer, both to decide the grade
    // and to decide whether to write it at all. Early practice on a not-yet-due
    // card is shown but never reschedules it.
    const card = api.getCard(item.word.id, item.direction);
    const scheduleThis = shouldSchedule(card, now);

    let grade: Grade;
    let correct: boolean;
    if ('grade' in answer) {
      grade = answer.grade;
      // For the streak/summary, "knew it" means anything but Again — a Hard
      // recall still counts, matching how a correct-but-Hard choice answer does.
      correct = grade > 1;
    } else {
      correct = answer.correct;
      grade = gradeForActivity(item.activity, correct, card, now);
    }

    // A drill repetition is practice only. The miss that caused it already wrote
    // its Again, and re-grading the same card two more times would triple the
    // review log for one lapse.
    const writeSchedule = scheduleThis && !item.drill;
    if (writeSchedule) {
      api.grade(item.word.id, item.direction, grade, now);
    }

    const drill = applyDrill(state.queue, state.index, state.pending, item, correct);

    const streak = correct ? state.streak + 1 : 0;
    const result: PlayResult = {
      ...state.result,
      correct: state.result.correct + (correct ? 1 : 0),
      wrong: state.result.wrong + (correct ? 0 : 1),
      practiced: state.result.practiced + (writeSchedule ? 0 : 1),
      total: state.result.total + 1,
      streakMax: Math.max(state.result.streakMax, streak),
    };

    advance(state, streak, result, drill.queue, drill.pending);
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
                {renderActivity(current, handleResult, handleIntroDone, conj)}
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
