import { writeJson } from './_shared/io.js';

// hermitdave/FrequencyWords fr_50k.txt — one "word count" per line
const URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fr/fr_50k.txt';
const OUT = 'data/raw-frequency.json';
const TARGET = 1200; // buffer for exclusions

// Obvious non-lemmas / function-word variants / contractions we drop.
// The list stays small on purpose — aggressive filtering happens during enrichment
// where the LLM can drop entries it can't meaningfully enrich.
const BLOCKLIST = new Set([
  'n', 't', 's', 'c', 'l', 'd', 'm', 'j', 'qu',
]);

async function main() {
  console.log(`Fetching ${URL}…`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const txt = await res.text();

  const entries: { french: string; freq: number }[] = [];
  for (const line of txt.split('\n')) {
    const [word, countStr] = line.trim().split(/\s+/);
    if (!word) continue;
    if (BLOCKLIST.has(word)) continue;
    if (/\d/.test(word)) continue;
    if (word.length > 25) continue;
    const freq = Number(countStr);
    if (!Number.isFinite(freq)) continue;
    entries.push({ french: word, freq });
    if (entries.length >= TARGET) break;
  }

  // rank = index + 1 after filtering
  const out = entries.map((e, i) => ({ rank: i + 1, french: e.french, freq: e.freq }));
  await writeJson(OUT, out);
  console.log(`Wrote ${out.length} entries to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
