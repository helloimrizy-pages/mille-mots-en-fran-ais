import { readJson, writeJson } from './_shared/io.js';
import type { Word } from './_shared/schema.js';

const IN_OUT = 'data/validated.json';

function baseSlug(audioPath: string): string {
  return audioPath.replace('/audio/words/', '').replace('/audio/sentences/', '').replace('.mp3', '');
}

async function main() {
  const words = await readJson<Word[]>(IN_OUT);
  console.log(`Starting with ${words.length} entries`);

  // 1. Dedupe by exact french string — keep first occurrence (lowest id/rank)
  const seen = new Set<string>();
  const deduped: Word[] = [];
  for (const w of words.sort((a, b) => a.id - b.id)) {
    if (seen.has(w.french)) {
      console.log(`  drop duplicate: ${w.french} (id ${w.id})`);
      continue;
    }
    seen.add(w.french);
    deduped.push(w);
  }
  console.log(`After dedupe: ${deduped.length} entries (removed ${words.length - deduped.length})`);

  // 2. Find slug collision groups
  const bySlug: Record<string, Word[]> = {};
  for (const w of deduped) {
    const slug = baseSlug(w.audio.word);
    (bySlug[slug] ||= []).push(w);
  }

  // 3. For slugs with >1 entry, prefix each audio path with id
  let renamed = 0;
  for (const [slug, arr] of Object.entries(bySlug)) {
    if (arr.length <= 1) continue;
    for (const w of arr) {
      const newWord = `/audio/words/${w.id}-${slug}.mp3`;
      const newSent = `/audio/sentences/${w.id}-${slug}.mp3`;
      console.log(`  rename: ${w.french} (id ${w.id}) → ${newWord}`);
      w.audio.word = newWord;
      w.audio.sentence = newSent;
      renamed++;
    }
  }
  console.log(`Renamed ${renamed} audio paths in ${Object.values(bySlug).filter(a => a.length > 1).length} collision groups`);

  await writeJson(IN_OUT, deduped);
  console.log(`Wrote ${deduped.length} entries to ${IN_OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
