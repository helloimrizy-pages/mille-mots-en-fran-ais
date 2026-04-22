import { describe, it, expect } from 'vitest';
import { wordSchema } from './schema';

const base = {
  id: 1, rank: 1, french: 'livre', english: 'book',
  pos: 'noun' as const, gender: 'm' as const, plural: 'livres',
  ipa: 'livʁ',
  example: { fr: "J'ai un livre.", en: 'I have a book.' },
  audio: { word: '/audio/words/livre.mp3', sentence: '/audio/sentences/livre.mp3' },
};

describe('wordSchema', () => {
  it('accepts a valid noun', () => {
    expect(() => wordSchema.parse(base)).not.toThrow();
  });
  it('rejects a noun without gender', () => {
    const { gender, ...rest } = base;
    expect(() => wordSchema.parse(rest)).toThrow();
  });
  it('rejects a non-noun with gender', () => {
    expect(() => wordSchema.parse({ ...base, pos: 'verb', gender: 'm', plural: undefined })).toThrow();
  });
  it('rejects audio paths with wrong prefix', () => {
    expect(() => wordSchema.parse({ ...base, audio: { word: '/foo.mp3', sentence: '/bar.mp3' } })).toThrow();
  });
});
