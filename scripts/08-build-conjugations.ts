import { alwaysAuxEtre } from 'french-verbs';
import lefff from 'french-verbs-lefff/dist/conjugations.json' with { type: 'json' };
import { readJson, writeJson } from './_shared/io.js';
import type { Word } from './_shared/schema.js';

const IN = 'public/words.json';
const OUT = 'public/conjugations.json';

/**
 * Lefff tense codes. P/I/F/C/S/Y/K/G are the ones we publish; J (passé simple)
 * and T (subjonctif imparfait) are indexed for lemma lookup only — a frequency
 * list contains literary forms like `fut`, and they must still resolve to a
 * lemma even though we never display those tenses.
 */
const DISPLAY_CODES = ['P', 'I', 'F', 'C', 'S', 'Y', 'K', 'G', 'W'] as const;
const INDEX_CODES = [...DISPLAY_CODES, 'J', 'T'] as const;

type LefffTable = Partial<Record<(typeof INDEX_CODES)[number], string[]>>;
const TABLES = lefff as unknown as Record<string, LefffTable>;

/**
 * Forms that map to more than one lemma. Each is resolved to the sense that
 * actually occurs in this word list — `suis` is far more often être than
 * suivre — except `essaie`, which Lefff simply does not index.
 */
const LEMMA_OVERRIDES: Record<string, string> = {
  suis: 'être',       // vs suivre
  sommes: 'être',     // vs sommer
  faut: 'falloir',    // vs faillir
  ouvre: 'ouvrir',    // vs ouvrer
  aille: 'aller',     // vs ailler
  crois: 'croire',    // vs croître
  cru: 'croire',      // vs croître
  'tué': 'tuer',      // vs taire
  devient: 'devenir', // vs dévier
  essaie: 'essayer',  // absent from the Lefff index
};

/** Tagged `verb` in words.json but not actually one, so it has no conjugation. */
const SKIP = new Set(['pos']);

/** Enclitics on inverted questions and imperatives: `est-ce`, `vas-y`, `dis-moi`. */
const ENCLITIC = /-(ce|je|tu|il|elle|on|nous|vous|ils|elles|moi|toi|y|en)$/;

/** Same accent-stripping normaliser used by 03-validate.ts. */
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Exported for the tests, which exercise resolution without running the pipeline. */
export function buildFormIndex(): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const [lemma, table] of Object.entries(TABLES)) {
    for (const code of INDEX_CODES) {
      for (const form of table[code] ?? []) {
        if (!form || form === 'NA') continue;
        const key = normalize(form);
        let bucket = index.get(key);
        if (!bucket) { bucket = new Set(); index.set(key, bucket); }
        bucket.add(lemma);
      }
    }
  }
  return index;
}

/**
 * Maps a word-list entry back to its infinitive. Tries the form as given, then
 * without an enclitic, then truncated at the first hyphen; at each step an exact
 * lemma hit beats an accent-insensitive index hit, and an ambiguous index hit is
 * only accepted if an override names the winner.
 *
 * Exported for the tests — the resolution rules are the fiddly part of this
 * script, and they are worth exercising without running the whole pipeline.
 */
export function resolveLemma(raw: string, index: Map<string, Set<string>>): string | null {
  const form = raw.toLowerCase();
  if (SKIP.has(form)) return null;

  for (const candidate of [form, form.replace(ENCLITIC, ''), form.split('-')[0] ?? form]) {
    if (LEMMA_OVERRIDES[candidate]) return LEMMA_OVERRIDES[candidate];
    if (TABLES[candidate]) return candidate;
    const matches = index.get(normalize(candidate));
    if (matches?.size === 1) return [...matches][0] as string;
  }
  return null;
}

/**
 * A person slot is null where the verb has no such form — impersonal verbs like
 * falloir exist only in the 3rd singular.
 */
export type PersonForms = (string | null)[];

export interface VerbTable {
  /** Passé composé auxiliary. */
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
  /** Participe passé (masc. sing.) and participe présent; empty when the verb has none. */
  pp: string;
  ppres: string;
}

export interface ConjugationData {
  /** Every verb entry in words.json → its infinitive. */
  forms: Record<string, string>;
  /** Infinitive → its table. Shared by every entry that resolves to it. */
  verbs: Record<string, VerbTable>;
}

function buildTable(lemma: string): VerbTable | null {
  const t = TABLES[lemma];
  if (!t?.P) return null;

  const aux: 'avoir' | 'être' = alwaysAuxEtre(lemma) ? 'être' : 'avoir';
  const participles = t.K ?? [];
  const ppMasc = participles[0] ?? '';
  // Lefff's K is [masc-sing, masc-plur, fem-sing, fem-plur]. With être the
  // participle agrees with the subject, so plural persons take the plural form;
  // with avoir it never agrees here. Feminine is surfaced in the UI as a hint
  // rather than by doubling every row.
  const ppPlur = participles[1] ?? ppMasc;
  const auxPresent = TABLES[aux]?.P ?? [];
  // Impersonal verbs (falloir, pleuvoir) carry a form only in the 3rd singular
  // slot and null elsewhere, so the présent doubles as the mask — without it we
  // would invent "ai fallu" for a verb that only ever appears as "il a fallu".
  const PC = auxPresent.map((a, i) => {
    if (!t.P?.[i]) return null;
    const participle = aux === 'être' && i >= 3 ? ppPlur : ppMasc;
    return `${a} ${participle}`;
  });

  // Lefff's Y is a 6-slot array with "NA" in the je/il/ils positions.
  const imperative = [t.Y?.[1], t.Y?.[3], t.Y?.[4]].filter((f): f is string => !!f && f !== 'NA');

  return {
    aux,
    P: t.P,
    I: t.I ?? [],
    F: t.F ?? [],
    C: t.C ?? [],
    S: t.S ?? [],
    Y: imperative,
    PC,
    pp: ppMasc,
    ppres: t.G?.[0] ?? '',
  };
}

async function main() {
  const words = await readJson<Word[]>(IN);
  const verbs = words.filter((w) => w.pos === 'verb');
  const index = buildFormIndex();

  const forms: Record<string, string> = {};
  const verbTables: Record<string, VerbTable> = {};
  const unresolved: string[] = [];
  const skipped: string[] = [];

  for (const word of verbs) {
    if (SKIP.has(word.french.toLowerCase())) { skipped.push(word.french); continue; }

    const lemma = resolveLemma(word.french, index);
    if (!lemma) { unresolved.push(word.french); continue; }

    if (!verbTables[lemma]) {
      const table = buildTable(lemma);
      if (!table) { unresolved.push(`${word.french} (lemma ${lemma} has no présent)`); continue; }
      verbTables[lemma] = table;
    }
    forms[word.french] = lemma;
  }

  // Fail loudly: a silently dropped verb would show up as a row that
  // mysteriously has no table, long after this script last ran.
  if (unresolved.length > 0) {
    console.error(`Could not resolve ${unresolved.length} verb(s) to a lemma:`);
    for (const f of unresolved) console.error(`  - ${f}`);
    console.error('Add each to LEMMA_OVERRIDES (or SKIP if it is not really a verb).');
    process.exit(1);
  }

  await writeJson(OUT, { forms, verbs: verbTables } satisfies ConjugationData, false);

  console.log(
    `Conjugations: ${Object.keys(forms).length} of ${verbs.length} verb entries → ` +
    `${Object.keys(verbTables).length} lemmas. Skipped: ${skipped.length ? skipped.join(', ') : 'none'}. → ${OUT}`,
  );
}

// Only run the pipeline when invoked directly, so the tests can import the resolver.
if (process.argv[1]?.endsWith('08-build-conjugations.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
