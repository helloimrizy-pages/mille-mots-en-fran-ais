import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Word } from '../types';
import { useConjugations, type PersonForms, type VerbTable } from '../hooks/useConjugations';

const PRONOUNS = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];
const IMPERATIVE_PRONOUNS = ['(tu)', '(nous)', '(vous)'];

/** The six tenses hidden behind the toggle, in teaching order. */
const MORE_TENSES: Array<{ key: keyof VerbTable; label: string }> = [
  { key: 'PC', label: 'Passé composé' },
  { key: 'I', label: 'Imparfait' },
  { key: 'F', label: 'Futur simple' },
  { key: 'C', label: 'Conditionnel' },
  { key: 'S', label: 'Subjonctif' },
];

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** `je`/`j'` before a vowel, so "je ai" never renders. */
function pronounFor(index: number, form: string): string {
  if (index !== 0) return PRONOUNS[index] as string;
  return /^[aeiouyàâéèêëîïôöûü]/i.test(form) ? "j'" : 'je';
}

function TenseBlock({ label, forms, highlight }: { label: string; forms: PersonForms; highlight: string }) {
  const filled = forms.filter(Boolean);
  if (filled.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-subtle mb-1">{label}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {forms.map((form, i) => {
          if (!form) return null;
          const isMatch = normalize(form) === highlight;
          return (
            <div key={i} className="text-sm flex gap-1.5">
              <span className="text-text-subtle shrink-0">{pronounFor(i, form)}</span>
              <span className={cn('truncate', isMatch ? 'text-emphasis font-semibold' : 'text-text')}>
                {form}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImperativeBlock({ forms, highlight }: { forms: string[]; highlight: string }) {
  if (forms.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-subtle mb-1">Impératif</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {forms.map((form, i) => (
          <div key={i} className="text-sm flex gap-1.5">
            <span className="text-text-subtle shrink-0">{IMPERATIVE_PRONOUNS[i]}</span>
            <span className={cn('truncate', normalize(form) === highlight ? 'text-emphasis font-semibold' : 'text-text')}>
              {form}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The conjugation table for a verb row. Most entries in the word list are
 * inflected tokens rather than infinitives (`est`, `veux`, `est-ce`), so the
 * table is looked up through the entry's lemma and the entry's own form is
 * highlighted wherever it appears.
 */
export function ConjugationPanel({ word }: { word: Word }) {
  const { data, error } = useConjugations();
  const [showAll, setShowAll] = useState(false);

  // Quiet degradation: a row that cannot show conjugations should look like a
  // row that simply has none, never like a broken one.
  if (error) return null;
  if (!data) {
    return <div className="mt-2 text-[11px] text-text-subtle">Loading conjugations…</div>;
  }

  const lemma = data.forms[word.french];
  const table = lemma ? data.verbs[lemma] : undefined;
  if (!lemma || !table) return null;

  const highlight = normalize(word.french);
  const isInfinitive = normalize(lemma) === highlight;

  return (
    <div className="mt-2 rounded-lg bg-bg p-3">
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <span className="text-[10px] uppercase tracking-wider text-text-subtle">Conjugations</span>
        <span className="text-sm font-medium">{lemma}</span>
        {!isInfinitive && (
          <span className="text-[11px] text-text-subtle">
            — {word.french} is a form of {lemma}
          </span>
        )}
      </div>

      <TenseBlock label="Présent" forms={table.P} highlight={highlight} />

      {showAll && (
        <div className="mt-3 flex flex-col gap-3">
          {MORE_TENSES.map(({ key, label }) => (
            <TenseBlock key={key} label={label} forms={table[key] as PersonForms} highlight={highlight} />
          ))}
          <ImperativeBlock forms={table.Y} highlight={highlight} />
          {(table.pp || table.ppres) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-text-subtle mr-1">Participles</span>
              {table.ppres && (
                <span className="text-[11px] px-2 py-[2px] rounded-pill bg-surface text-text-muted">
                  {table.ppres} (prés.)
                </span>
              )}
              {table.pp && (
                <span className="text-[11px] px-2 py-[2px] rounded-pill bg-surface text-text-muted">
                  {table.pp} (passé)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        aria-expanded={showAll}
        className="mt-3 text-[11px] px-2 py-[2px] rounded-pill border border-border bg-surface hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
      >
        {showAll ? 'Fewer tenses' : 'More tenses'}
      </button>
    </div>
  );
}
