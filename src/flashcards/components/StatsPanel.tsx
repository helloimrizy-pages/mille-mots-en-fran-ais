import { useMemo, useState } from 'react';
import { ALL_POS, POS_LABEL, type PartOfSpeech } from '../../types';
import type { Word } from '../../types';
import { useFlashcardState } from '../useFlashcardState';
import type { CardState } from '../types';

const MATURE_DAYS = 21;
const RETENTION_WINDOW_DAYS = 30;

interface Props {
  words: Word[];
}

interface StateBucket {
  new: number;
  learning: number;
  review: number;
  relearning: number;
  mature: number;
  young: number;
  dueToday: number;
}

function emptyBucket(): StateBucket {
  return { new: 0, learning: 0, review: 0, relearning: 0, mature: 0, young: 0, dueToday: 0 };
}

function isMature(card: CardState): boolean {
  return card.scheduledDays >= MATURE_DAYS;
}

export function StatsPanel({ words }: Props) {
  const { cards, log, resetAll } = useFlashcardState();
  const [confirmReset, setConfirmReset] = useState(false);

  const wordById = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const totalCards = words.length * 2;

  const totals = useMemo(() => {
    const b = emptyBucket();
    const now = Date.now();
    for (const c of Object.values(cards)) {
      if (c.state === 'learning') b.learning++;
      else if (c.state === 'review') b.review++;
      else if (c.state === 'relearning') b.relearning++;
      if (c.state !== 'new') {
        if (isMature(c)) b.mature++; else b.young++;
        if (new Date(c.due).getTime() <= now) b.dueToday++;
      }
    }
    const seen = b.learning + b.review + b.relearning;
    b.new = totalCards - seen;
    return b;
  }, [cards, totalCards]);

  const perPos = useMemo(() => {
    const counts = new Map<PartOfSpeech, { seen: number; mature: number; dueToday: number }>();
    for (const p of ALL_POS) counts.set(p, { seen: 0, mature: 0, dueToday: 0 });
    const now = Date.now();
    for (const c of Object.values(cards)) {
      if (c.state === 'new') continue;
      const w = wordById.get(c.wordId);
      if (!w) continue;
      const row = counts.get(w.pos);
      if (!row) continue;
      row.seen++;
      if (isMature(c)) row.mature++;
      if (new Date(c.due).getTime() <= now) row.dueToday++;
    }
    return counts;
  }, [cards, wordById]);

  const retention = useMemo(() => {
    const cutoff = Date.now() - RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const recent = log.filter((e) => new Date(e.reviewedAt).getTime() >= cutoff);
    if (recent.length === 0) return null;
    const good = recent.filter((e) => e.grade >= 3).length;
    return { total: recent.length, pct: Math.round((good / recent.length) * 100) };
  }, [log]);

  return (
    <div className="flex flex-col gap-6 p-4">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Cards</h3>
        <div className="grid grid-cols-4 gap-2">
          <Stat label="New" value={totals.new} />
          <Stat label="Learning" value={totals.learning} />
          <Stat label="Review" value={totals.review} />
          <Stat label="Relearn" value={totals.relearning} />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Maturity</h3>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Mature" value={totals.mature} hint="≥ 21d" />
          <Stat label="Young" value={totals.young} hint="< 21d" />
          <Stat label="Due today" value={totals.dueToday} />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Retention (30d)</h3>
        <div className="bg-surface rounded-md border border-border p-3">
          {retention ? (
            <>
              <span className="text-2xl font-semibold">{retention.pct}%</span>
              <span className="text-text-muted text-sm ml-2">of {retention.total} reviews graded Good or Easy</span>
            </>
          ) : (
            <span className="text-text-muted text-sm">No reviews yet</span>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">By word type</h3>
        <div className="bg-surface rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-text-subtle uppercase">
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-right px-3 py-2">Seen</th>
                <th className="text-right px-3 py-2">Mature</th>
                <th className="text-right px-3 py-2">Due</th>
              </tr>
            </thead>
            <tbody>
              {ALL_POS.map((p) => {
                const row = perPos.get(p) ?? { seen: 0, mature: 0, dueToday: 0 };
                return (
                  <tr key={p} className="border-t border-border">
                    <td className="px-3 py-2">{POS_LABEL[p]}</td>
                    <td className="text-right px-3 py-2 tabular-nums">{row.seen}</td>
                    <td className="text-right px-3 py-2 tabular-nums">{row.mature}</td>
                    <td className="text-right px-3 py-2 tabular-nums">{row.dueToday}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="text-sm text-red-600 hover:text-red-700 underline"
          >
            Reset all progress
          </button>
        ) : (
          <div className="flex flex-col gap-2 bg-red-500/5 border border-red-500/20 rounded-md p-3">
            <p className="text-sm">Delete all SRS progress? This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { resetAll(); setConfirmReset(false); }}
                className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-700"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 rounded-md border border-border text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="bg-surface rounded-md border border-border p-3">
      <div className="text-[11px] text-text-subtle">{label}{hint && <span className="ml-1 opacity-70">{hint}</span>}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
