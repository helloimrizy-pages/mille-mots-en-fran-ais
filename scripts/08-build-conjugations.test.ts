import { describe, it, expect, beforeAll } from 'vitest';
import { buildFormIndex, resolveLemma } from './08-build-conjugations';

let index: Map<string, Set<string>>;
beforeAll(() => { index = buildFormIndex(); });

const resolve = (form: string) => resolveLemma(form, index);

describe('resolveLemma', () => {
  it('maps an infinitive to itself', () => {
    expect(resolve('faire')).toBe('faire');
    expect(resolve('parler')).toBe('parler');
  });

  it('maps inflected forms back to the infinitive', () => {
    expect(resolve('est')).toBe('être');
    expect(resolve('sont')).toBe('être');
    expect(resolve('était')).toBe('être');
    expect(resolve('ai')).toBe('avoir');
    expect(resolve('va')).toBe('aller');
    expect(resolve('veux')).toBe('vouloir');
    expect(resolve('dit')).toBe('dire');
  });

  it('strips enclitics from inverted questions and imperatives', () => {
    expect(resolve('est-ce')).toBe('être');
    expect(resolve('avez-vous')).toBe('avoir');
    expect(resolve('vas-y')).toBe('aller');
    expect(resolve('dis-moi')).toBe('dire');
    expect(resolve('puis-je')).toBe('pouvoir');
  });

  it('matches accent-insensitively, so untyped accents still resolve', () => {
    expect(resolve('plait')).toBe('plaire');   // plaît
    expect(resolve('peter')).toBe('péter');
  });

  it('resolves literary forms that are indexed but never displayed', () => {
    expect(resolve('fut')).toBe('être');       // passé simple
  });

  it('applies an override for each genuinely ambiguous form', () => {
    expect(resolve('suis')).toBe('être');      // vs suivre
    expect(resolve('sommes')).toBe('être');    // vs sommer
    expect(resolve('faut')).toBe('falloir');   // vs faillir
    expect(resolve('crois')).toBe('croire');   // vs croître
    expect(resolve('cru')).toBe('croire');
    expect(resolve('tué')).toBe('tuer');       // vs taire
    expect(resolve('devient')).toBe('devenir');// vs dévier
    expect(resolve('ouvre')).toBe('ouvrir');
    expect(resolve('aille')).toBe('aller');
    expect(resolve('essaie')).toBe('essayer'); // absent from Lefff
  });

  it('returns null for a skipped non-verb and for an unknown form', () => {
    expect(resolve('pos')).toBeNull();
    expect(resolve('zzzznotaverb')).toBeNull();
  });

  it('resolves every verb entry in the shipped word list', async () => {
    const words = (await import('../public/words.json')).default as Array<{ french: string; pos: string }>;
    const unresolved = words
      .filter((w) => w.pos === 'verb' && w.french !== 'pos')
      .filter((w) => resolve(w.french) === null)
      .map((w) => w.french);
    expect(unresolved).toEqual([]);
  });
});
