import type { Word } from '../types';
import type { ConjugationData, PersonForms } from '../hooks/useConjugations';

const PERSONS = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];

const TENSE_LABELS: Record<string, string> = {
  P: 'présent',
  PC: 'passé composé',
  I: 'imparfait',
  F: 'futur',
  C: 'conditionnel',
  S: 'subjonctif',
};

/** Order matters: the earliest tense a form appears in is the one reported. */
const TENSE_CODES = ['P', 'PC', 'I', 'F', 'C', 'S'] as const;

const GENDER_LABELS: Record<string, string> = { m: 'masculine', f: 'feminine', mf: 'masc./fem.' };

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * A short grammatical label for the entry, so a prompt like "have" says which
 * of `ai` / `as` / `avez` / `avons` / `ont` it means.
 *
 * Returns null when nothing useful applies — multi-word phrases (`est-ce`,
 * `dis-moi`) and words with no inflection data — and the chip then does not
 * render at all.
 */
export function grammarHint(word: Word, conj: ConjugationData | null): string | null {
  if (word.pos === 'verb') {
    const lemma = conj?.forms[word.french];
    const table = lemma ? conj?.verbs[lemma] : undefined;
    if (!lemma || !table) return null;

    const target = normalize(word.french);
    if (normalize(lemma) === target) return 'infinitive';

    for (const code of TENSE_CODES) {
      const forms = table[code] as PersonForms;
      const person = forms.findIndex((f) => f !== null && normalize(f) === target);
      if (person >= 0) return `${PERSONS[person]} · ${TENSE_LABELS[code]} · ${lemma}`;
    }
    if (table.Y.some((f) => normalize(f) === target)) return `impératif · ${lemma}`;
    if (table.pp && normalize(table.pp) === target) return `participe passé · ${lemma}`;
    if (table.ppres && normalize(table.ppres) === target) return `participe présent · ${lemma}`;
    return null;
  }

  if (word.pos === 'noun' && word.gender) return GENDER_LABELS[word.gender] ?? null;
  return null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Fixed width so the blank never leaks the length of the answer. */
const BLANK = '____';

function clozeRegExp(french: string): RegExp {
  // A form ending in an apostrophe is already elided (`d'`, `n'`, `qu'`), so the
  // next character is legitimately a letter and no trailing boundary can be
  // required. Everything else needs one, or `ai` would match inside `aimer`.
  const trailing = /['’]$/.test(french) ? '' : '(?![\\p{L}\\p{M}])';
  return new RegExp(`(^|[^\\p{L}\\p{M}])(${escapeRe(french)})${trailing}`, 'giu');
}

/**
 * The example sentence with every occurrence of the entry's own form blanked,
 * used as the English→French prompt's disambiguator. This is what separates
 * `heureuse` from `heureux` and `vos` from `ton`, which no amount of
 * conjugation data can do.
 *
 * Null when the sentence does not actually contain the form — commonly an
 * infinitive whose example uses a conjugated form — leaving the hint chip to
 * carry the prompt on its own.
 */
export function clozeSentence(word: Word): string | null {
  const sentence = word.example.fr;
  const re = clozeRegExp(word.french);
  if (!re.test(sentence)) return null;
  re.lastIndex = 0;
  return sentence.replace(re, (_m, lead: string) => `${lead}${BLANK}`);
}
