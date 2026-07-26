import { describe, expect, it } from 'vitest';
import type { Word } from '../types';
import { acceptableAnswers, isTypedAnswerCorrect } from './answerCheck';

import words from '../../public/words.json';
const WORDS = words as unknown as Word[];

const glossOf = (french: string) => {
  const w = WORDS.find((x) => x.french === french);
  if (!w) throw new Error(`no entry for ${french}`);
  return w.english;
};

describe('acceptableAnswers', () => {
  it('splits alternatives written with a slash', () => {
    expect(acceptableAnswers('more / plus')).toContain('more');
    expect(acceptableAnswers('more / plus')).toContain('plus');
  });

  it('splits alternatives written with commas or semicolons', () => {
    expect(acceptableAnswers('of, from')).toEqual(expect.arrayContaining(['of', 'from']));
  });

  it('drops a parenthetical note, which is not part of the answer', () => {
    expect(acceptableAnswers('you (object)')).toContain('you');
  });

  it('does not split on a slash inside a note', () => {
    // The trap: naive slash-splitting yields "know (1st" and "2nd person …".
    // The verbatim gloss is deliberately kept as an answer, so check the
    // alternatives derived from it.
    const gloss = 'know (1st/2nd person singular of savoir)';
    const derived = acceptableAnswers(gloss).filter((a) => a !== gloss);
    expect(derived).toEqual(['know']);
  });

  it('combines commas and a trailing note', () => {
    const alts = acceptableAnswers('says, said (3rd person singular of dire)');
    expect(alts).toEqual(expect.arrayContaining(['says', 'said']));
  });

  it('keeps the gloss as written so typing it verbatim still passes', () => {
    expect(acceptableAnswers('more / plus')).toContain('more / plus');
  });

  it('never returns an empty list, even for a gloss that is only a note', () => {
    expect(acceptableAnswers('(question marker)').length).toBeGreaterThan(0);
  });
});

describe('isTypedAnswerCorrect', () => {
  it('accepts either side of a slash — the reported bug', () => {
    const gloss = glossOf('plus'); // "more / plus"
    expect(isTypedAnswerCorrect('more', gloss)).toBe(true);
    expect(isTypedAnswerCorrect('plus', gloss)).toBe(true);
    expect(isTypedAnswerCorrect('more / plus', gloss)).toBe(true);
  });

  it('accepts any listed meaning', () => {
    const gloss = glossOf('on'); // "one, we, people"
    for (const answer of ['one', 'we', 'people']) {
      expect(isTypedAnswerCorrect(answer, gloss)).toBe(true);
    }
  });

  it('accepts the answer without its grammatical note', () => {
    expect(isTypedAnswerCorrect('know', glossOf('sais'))).toBe(true);
    expect(isTypedAnswerCorrect('want', glossOf('veux'))).toBe(true);
    expect(isTypedAnswerCorrect('you', glossOf('te'))).toBe(true);
  });

  it('accepts multi-word alternatives whole', () => {
    const gloss = glossOf('faire'); // "to do / to make"
    expect(isTypedAnswerCorrect('to do', gloss)).toBe(true);
    expect(isTypedAnswerCorrect('to make', gloss)).toBe(true);
  });

  it('still rejects a genuinely wrong answer', () => {
    expect(isTypedAnswerCorrect('cat', glossOf('plus'))).toBe(false);
    expect(isTypedAnswerCorrect('', glossOf('plus'))).toBe(false);
    // A fragment of a multi-word alternative is not an answer.
    expect(isTypedAnswerCorrect('person', glossOf('sais'))).toBe(false);
  });

  it('is unaffected in the French direction, where glosses are single forms', () => {
    // No french field in the word list contains a comma, slash or parenthesis,
    // so en-fr answers behave exactly as before.
    const offenders = WORDS.filter((w) => /[,;/()]/.test(w.french));
    expect(offenders).toEqual([]);
  });

  it('ignores case and accents, as before', () => {
    expect(isTypedAnswerCorrect('MORE', glossOf('plus'))).toBe(true);
    expect(isTypedAnswerCorrect('etre', 'être')).toBe(true);
  });

  it('tolerates stray whitespace around and inside the answer', () => {
    expect(isTypedAnswerCorrect('  more  ', glossOf('plus'))).toBe(true);
    // Typing the gloss without its slash leaves a single space where the
    // punctuation was, which must still match.
    expect(isTypedAnswerCorrect('more plus', glossOf('plus'))).toBe(true);
    expect(isTypedAnswerCorrect('to  do', glossOf('faire'))).toBe(true);
  });

  it('accepts the first listed meaning of every word in the list', () => {
    // Guards the whole corpus: whatever the gloss's punctuation, its leading
    // meaning must be an accepted answer.
    const failures = WORDS.filter((w) => {
      const first = acceptableAnswers(w.english)[1] ?? w.english;
      return !isTypedAnswerCorrect(first, w.english);
    }).map((w) => `${w.french}=${w.english}`);
    expect(failures).toEqual([]);
  });
});
