import { readJson, writeJson } from './_shared/io.js';
import type { Word } from './_shared/schema.js';

const IN = 'data/validated.json';
const OUT = 'public/words.json';

async function main() {
  const words = await readJson<Word[]>(IN);
  // Sort by rank for stable default order; the UI re-sorts anyway.
  words.sort((a, b) => a.rank - b.rank);
  await writeJson(OUT, words, false); // minified
  console.log(`Wrote ${words.length} words to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
