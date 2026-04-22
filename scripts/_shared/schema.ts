import { z } from 'zod';

export const partOfSpeech = z.enum([
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'conjunction', 'preposition',
]);
export const gender = z.enum(['m', 'f', 'mf']);

export const synonymSchema = z.object({
  word: z.string().min(1),
  note: z.string().optional(),
});

export const wordSchema = z.object({
  id: z.number().int().positive(),
  rank: z.number().int().positive(),
  french: z.string().min(1),
  english: z.string().min(1),
  pos: partOfSpeech,
  gender: gender.optional(),
  plural: z.string().optional(),
  ipa: z.string().min(1),
  example: z.object({
    fr: z.string().min(1),
    en: z.string().min(1),
  }),
  synonyms: z.array(synonymSchema).max(5).optional(),
  audio: z.object({
    word: z.string().startsWith('/audio/words/'),
    sentence: z.string().startsWith('/audio/sentences/'),
  }),
}).superRefine((w, ctx) => {
  if (w.pos === 'noun' && !w.gender) {
    ctx.addIssue({ code: 'custom', message: 'noun must have a gender' });
  }
  if (w.pos !== 'noun' && w.gender) {
    ctx.addIssue({ code: 'custom', message: 'only nouns carry gender' });
  }
  if (w.pos !== 'noun' && w.plural) {
    ctx.addIssue({ code: 'custom', message: 'only nouns carry a plural form' });
  }
});

export type Word = z.infer<typeof wordSchema>;
export const wordsSchema = z.array(wordSchema);
