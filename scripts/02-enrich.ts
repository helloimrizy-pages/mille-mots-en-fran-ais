import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readJson, writeJson, fileExists } from './_shared/io.js';
import { wordSchema, type Word } from './_shared/schema.js';
import { z } from 'zod';

const IN = 'data/raw-frequency.json';
const OUT = 'data/enriched.json';
const BATCH_SIZE = 20;
const TARGET_COUNT = 1000;

// What the LLM returns — audio paths are added by this script, not the model.
const llmItemSchema = z.object({
  french: z.string(),
  english: z.string(),
  pos: z.enum(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'conjunction', 'preposition']),
  gender: z.enum(['m', 'f', 'mf']).optional(),
  plural: z.string().optional(),
  ipa: z.string(),
  example: z.object({ fr: z.string(), en: z.string() }),
  synonyms: z.array(z.object({ word: z.string(), note: z.string().optional() })).max(3).optional(),
  drop: z.boolean().optional(),
});

const SYSTEM_PROMPT = `You enrich French vocabulary entries for a learner app.
For each French word given, return ONE JSON object with:
- french: the input word (unchanged unless it was malformed)
- english: primary English meaning (short, learner-friendly)
- pos: one of noun/verb/adjective/adverb/pronoun/conjunction/preposition
- gender: "m" / "f" / "mf" — only if pos="noun". Omit otherwise.
- plural: plural form — only if pos="noun". Omit otherwise.
- ipa: IPA phonetic transcription WITHOUT surrounding brackets (e.g. "livʁ", not "[livʁ]")
- example: { fr, en } — a natural example sentence using the word in its primary sense
- synonyms: up to 2 common synonyms, each { word, note? } where note is e.g. "informal", "formal"
- drop: true ONLY if the entry is a proper noun, a spelling variant already covered by another entry, or otherwise unsuitable for a learner list

Return a JSON array, one object per input word, in the same order.
No prose. No markdown fences. Just the JSON array.`;

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const raw = await readJson<Array<{ rank: number; french: string }>>(IN);

  let existing: Word[] = [];
  if (await fileExists(OUT)) {
    existing = await readJson<Word[]>(OUT);
    console.log(`Resuming — ${existing.length} words already enriched`);
  }
  const done = new Set(existing.map((w) => w.french));
  const todo = raw.filter((r) => !done.has(r.french));

  const client = new Anthropic();

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    if (existing.length >= TARGET_COUNT) break;

    const batch = todo.slice(i, i + BATCH_SIZE);
    const userContent = `Enrich these ${batch.length} French words:\n${batch.map((b) => b.french).join('\n')}`;

    const first = batch[0];
    const last = batch[batch.length - 1];
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} — ${first?.french}…${last?.french}`);

    let res;
    try {
      res = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });
    } catch (e) {
      console.warn(`  API error, skipping: ${(e as Error).message}`);
      continue;
    }

    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();

    // Strip potential markdown fences even though we asked not to
    const cleanedText = text
      .replace(/^```json\s*\n?/i, '')
      .replace(/^```\s*\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanedText);
    } catch {
      console.warn('  JSON parse failed; skipping batch');
      continue;
    }

    const items = z.array(llmItemSchema).safeParse(parsed);
    if (!items.success) {
      console.warn(`  LLM schema parse failed: ${items.error.issues.slice(0, 2).map((i) => i.message).join('; ')}`);
      continue;
    }

    for (let j = 0; j < items.data.length; j++) {
      const item = items.data[j];
      const input = batch[j];
      if (!input || !item) continue;
      if (item.drop) {
        console.log(`  drop: ${input.french}`);
        continue;
      }
      const id = existing.length + 1;
      const wordCandidate: Word = {
        id,
        rank: input.rank,
        french: item.french,
        english: item.english,
        pos: item.pos,
        ...(item.gender ? { gender: item.gender } : {}),
        ...(item.plural ? { plural: item.plural } : {}),
        ipa: item.ipa,
        example: item.example,
        ...(item.synonyms ? { synonyms: item.synonyms } : {}),
        audio: {
          word: `/audio/words/${slug(item.french)}.mp3`,
          sentence: `/audio/sentences/${slug(item.french)}.mp3`,
        },
      };
      const vr = wordSchema.safeParse(wordCandidate);
      if (!vr.success) {
        console.warn(`  schema reject: ${input.french} — ${vr.error.issues[0]?.message ?? 'unknown'}`);
        continue;
      }
      existing.push(vr.data);
    }

    await writeJson(OUT, existing);
    console.log(`  → ${existing.length} total`);
  }

  console.log(`Done. ${existing.length} entries in ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
