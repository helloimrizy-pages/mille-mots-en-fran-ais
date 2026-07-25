import { describe, expect, it } from 'vitest';
import type { Word } from '../types';
import type { ConjugationData } from '../hooks/useConjugations';
import { clozeSentence, grammarHint } from './prompt';

// The real generated artifact — these helpers exist to disambiguate the actual
// word list, so testing them against a hand-made fixture would prove little.
import conjugations from '../../public/conjugations.json';
import words from '../../public/words.json';

const CONJ = conjugations as unknown as ConjugationData;
const WORDS = words as unknown as Word[];

const verb = (french: string): Word => {
  const w = WORDS.find((x) => x.french === french && x.pos === 'verb');
  if (!w) throw new Error(`no verb entry for ${french}`);
  return w;
};

function word(french: string, overrides: Partial<Word> = {}): Word {
  return {
    id: 1, rank: 1, french, english: 'x', pos: 'noun', ipa: '/x/',
    example: { fr: 'Ex.', en: 'Ex.' }, audio: { word: 'w.mp3', sentence: 's.mp3' },
    ...overrides,
  };
}

describe('grammarHint', () => {
  it('separates every member of the "have" family', () => {
    // The exact case that prompted this: five entries, all glossed "have".
    expect(grammarHint(verb('ai'), CONJ)).toBe('je · présent · avoir');
    expect(grammarHint(verb('as'), CONJ)).toBe('tu · présent · avoir');
    expect(grammarHint(verb('avez'), CONJ)).toBe('vous · présent · avoir');
    expect(grammarHint(verb('avons'), CONJ)).toBe('nous · présent · avoir');
    expect(grammarHint(verb('ont'), CONJ)).toBe('ils/elles · présent · avoir');
  });

  it('separates the "will be" family by person', () => {
    expect(grammarHint(verb('serai'), CONJ)).toBe('je · futur · être');
    expect(grammarHint(verb('sera'), CONJ)).toBe('il/elle · futur · être');
  });

  it('labels an infinitive as such, distinguishing it from its own forms', () => {
    expect(grammarHint(verb('avoir'), CONJ)).toBe('infinitive');
    expect(grammarHint(verb('faire'), CONJ)).toBe('infinitive');
  });

  it('labels participles', () => {
    expect(grammarHint(verb('été'), CONJ)).toBe('participe passé · être');
  });

  it('returns null for multi-word phrases', () => {
    expect(grammarHint(verb('est-ce'), CONJ)).toBeNull();
    expect(grammarHint(verb('dis-moi'), CONJ)).toBeNull();
  });

  it('returns null for a verb when the data has not loaded yet', () => {
    expect(grammarHint(verb('ai'), null)).toBeNull();
  });

  it('reports gender for nouns and nothing for other parts of speech', () => {
    expect(grammarHint(word('livre', { pos: 'noun', gender: 'm' }), CONJ)).toBe('masculine');
    expect(grammarHint(word('année', { pos: 'noun', gender: 'f' }), CONJ)).toBe('feminine');
    expect(grammarHint(word('vite', { pos: 'adverb' }), CONJ)).toBeNull();
  });
});

describe('clozeSentence', () => {
  it('blanks the entry\'s own form', () => {
    const w = word('ai', { example: { fr: "J'ai deux frères.", en: 'I have two brothers.' } });
    expect(clozeSentence(w)).toBe("J'____ deux frères.");
  });

  it('does not match inside a longer word', () => {
    const w = word('ai', { example: { fr: "J'aime les chats.", en: 'I like cats.' } });
    expect(clozeSentence(w)).toBeNull();
  });

  it('blanks an elided clitic, whose next character is a letter', () => {
    const w = word("n'", { example: { fr: "Je n'ai pas faim.", en: 'I am not hungry.' } });
    expect(clozeSentence(w)).toBe('Je ____ai pas faim.');
  });

  it('blanks every occurrence', () => {
    const w = word('le', { example: { fr: 'le chien et le chat', en: 'the dog and the cat' } });
    expect(clozeSentence(w)).toBe('____ chien et ____ chat');
  });

  it('uses a constant blank width so the answer length does not leak', () => {
    const short = word('va', { example: { fr: 'Il va bien.', en: 'He is well.' } });
    const long = word('travaillons', { example: { fr: 'Nous travaillons ici.', en: 'We work here.' } });
    const blankOf = (s: string | null) => s?.match(/_+/)?.[0];
    expect(blankOf(clozeSentence(short))).toBe(blankOf(clozeSentence(long)));
  });

  it('matches case-insensitively at the start of a sentence', () => {
    const w = word('vos', { example: { fr: 'Vos enfants sont adorables.', en: 'Your children are lovely.' } });
    expect(clozeSentence(w)).toBe('____ enfants sont adorables.');
  });

  it('returns null when the sentence uses a different form', () => {
    const w = word('parler', { example: { fr: 'Je parle français.', en: 'I speak French.' } });
    expect(clozeSentence(w)).toBeNull();
  });

  it('disambiguates the adjectives conjugation data cannot reach', () => {
    const w = WORDS.find((x) => x.french === 'heureuse');
    expect(w && clozeSentence(w)).toContain('____');
  });

  it('covers the great majority of the shipped word list', () => {
    const covered = WORDS.filter((w) => clozeSentence(w) !== null).length;
    expect(covered / WORDS.length).toBeGreaterThan(0.9);
  });
});
