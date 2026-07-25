import { useEffect, useState } from 'react';

/**
 * A person slot is null where the verb has no such form — impersonal verbs like
 * falloir exist only in the 3rd singular.
 */
export type PersonForms = (string | null)[];

export interface VerbTable {
  aux: 'avoir' | 'être';
  /** Présent, imparfait, futur simple, conditionnel, subjonctif — 6 persons each. */
  P: PersonForms;
  I: PersonForms;
  F: PersonForms;
  C: PersonForms;
  S: PersonForms;
  /** Impératif — tu / nous / vous only. */
  Y: string[];
  /** Passé composé, 6 persons, auxiliary already conjugated. */
  PC: PersonForms;
  pp: string;
  ppres: string;
}

export interface ConjugationData {
  /** Every verb entry in words.json → its infinitive. */
  forms: Record<string, string>;
  /** Infinitive → its table, shared by every entry resolving to it. */
  verbs: Record<string, VerbTable>;
}

// Module-level cache plus an in-flight guard: several verb rows can be expanded
// at once, and they must share one request rather than each firing their own.
let cache: ConjugationData | null = null;
let inFlight: Promise<ConjugationData> | null = null;

function fetchConjugations(): Promise<ConjugationData> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;
  inFlight = fetch('/conjugations.json')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<ConjugationData>;
    })
    .then((data) => { cache = data; return data; })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Test seam — the cache would otherwise leak between cases. */
export function resetConjugationCache(): void {
  cache = null;
  inFlight = null;
}

export interface ConjugationsState {
  data: ConjugationData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Lazily loads the conjugation tables. Deliberately not fetched at app start:
 * only someone expanding a verb row needs them, and words.json already costs
 * 72 KB on load.
 */
export function useConjugations(): ConjugationsState {
  // Seeded from the cache, so a panel opened after the first fetch renders the
  // table on its very first paint with no effect and no loading flash.
  const [data, setData] = useState<ConjugationData | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;
    let active = true;
    fetchConjugations()
      .then((d) => { if (active) setData(d); })
      .catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  return { data, loading: data === null && error === null, error };
}
