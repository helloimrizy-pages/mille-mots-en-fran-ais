import type { Word } from './types';

export const SEED_WORDS: Word[] = [
  {
    id: 1, rank: 1, french: 'être', english: 'to be',
    pos: 'verb', ipa: 'ɛtʁ',
    example: { fr: 'Je veux être heureux.', en: 'I want to be happy.' },
    audio: { word: '/audio/words/etre.mp3', sentence: '/audio/sentences/etre.mp3' },
  },
  {
    id: 2, rank: 2, french: 'avoir', english: 'to have',
    pos: 'verb', ipa: 'a.vwaʁ',
    example: { fr: "J'ai un livre.", en: 'I have a book.' },
    audio: { word: '/audio/words/avoir.mp3', sentence: '/audio/sentences/avoir.mp3' },
  },
  {
    id: 3, rank: 42, french: 'livre', english: 'book',
    pos: 'noun', gender: 'm', plural: 'livres', ipa: 'livʁ',
    example: { fr: "J'ai acheté un livre hier.", en: 'I bought a book yesterday.' },
    synonyms: [{ word: 'bouquin', note: 'informal' }],
    audio: { word: '/audio/words/livre.mp3', sentence: '/audio/sentences/livre.mp3' },
  },
  {
    id: 4, rank: 80, french: 'maison', english: 'house',
    pos: 'noun', gender: 'f', plural: 'maisons', ipa: 'mɛ.zɔ̃',
    example: { fr: 'Leur maison est grande.', en: 'Their house is big.' },
    audio: { word: '/audio/words/maison.mp3', sentence: '/audio/sentences/maison.mp3' },
  },
  {
    id: 5, rank: 150, french: 'rapidement', english: 'quickly',
    pos: 'adverb', ipa: 'ʁa.pid.mɑ̃',
    example: { fr: 'Il court rapidement.', en: 'He runs quickly.' },
    audio: { word: '/audio/words/rapidement.mp3', sentence: '/audio/sentences/rapidement.mp3' },
  },
  {
    id: 6, rank: 95, french: 'petit', english: 'small',
    pos: 'adjective', ipa: 'pə.ti',
    example: { fr: 'Un petit chat dort.', en: 'A small cat is sleeping.' },
    audio: { word: '/audio/words/petit.mp3', sentence: '/audio/sentences/petit.mp3' },
  },
  {
    id: 7, rank: 12, french: 'je', english: 'I',
    pos: 'pronoun', ipa: 'ʒə',
    example: { fr: 'Je parle français.', en: 'I speak French.' },
    audio: { word: '/audio/words/je.mp3', sentence: '/audio/sentences/je.mp3' },
  },
  {
    id: 8, rank: 20, french: 'mais', english: 'but',
    pos: 'conjunction', ipa: 'mɛ',
    example: { fr: 'Je veux mais je ne peux pas.', en: 'I want to but I cannot.' },
    audio: { word: '/audio/words/mais.mp3', sentence: '/audio/sentences/mais.mp3' },
  },
  {
    id: 9, rank: 9, french: 'à', english: 'to, at',
    pos: 'preposition', ipa: 'a',
    example: { fr: 'Je vais à Paris.', en: 'I am going to Paris.' },
    audio: { word: '/audio/words/a.mp3', sentence: '/audio/sentences/a.mp3' },
  },
  {
    id: 10, rank: 300, french: 'parler', english: 'to speak',
    pos: 'verb', ipa: 'paʁ.le',
    example: { fr: 'Nous aimons parler français.', en: 'We like to speak French.' },
    audio: { word: '/audio/words/parler.mp3', sentence: '/audio/sentences/parler.mp3' },
  },
];
