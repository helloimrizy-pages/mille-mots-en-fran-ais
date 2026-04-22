export type PartOfSpeech =
  | 'noun' | 'verb' | 'adjective' | 'adverb'
  | 'pronoun' | 'conjunction' | 'preposition';

export type Gender = 'm' | 'f' | 'mf';

export interface Synonym {
  word: string;
  note?: string;
}

export interface Word {
  id: number;
  rank: number;
  french: string;
  english: string;
  pos: PartOfSpeech;
  gender?: Gender;
  plural?: string;
  ipa: string;
  example: { fr: string; en: string };
  synonyms?: Synonym[];
  audio: { word: string; sentence: string };
}

export const ALL_POS: readonly PartOfSpeech[] = [
  'noun', 'verb', 'adjective', 'adverb',
  'pronoun', 'conjunction', 'preposition',
] as const;

export const POS_LABEL: Record<PartOfSpeech, string> = {
  noun: 'Noun',
  verb: 'Verb',
  adjective: 'Adj',
  adverb: 'Adv',
  pronoun: 'Pron',
  conjunction: 'Conj',
  preposition: 'Prep',
};
