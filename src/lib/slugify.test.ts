import { describe, it, expect } from 'vitest';
import { slugify } from './slugify';

describe('slugify', () => {
  it('lowercases plain words', () => {
    expect(slugify('Livre')).toBe('livre');
  });
  it('replaces French accents with ASCII equivalents', () => {
    expect(slugify('école')).toBe('ecole');
    expect(slugify('être')).toBe('etre');
    expect(slugify('ça')).toBe('ca');
    expect(slugify('où')).toBe('ou');
  });
  it('replaces spaces and apostrophes with dashes', () => {
    expect(slugify("qu'est-ce que")).toBe('qu-est-ce-que');
  });
  it('strips non-alphanumeric non-dash characters', () => {
    expect(slugify('bonjour!')).toBe('bonjour');
  });
  it('collapses consecutive dashes', () => {
    expect(slugify('a -- b')).toBe('a-b');
  });
});
