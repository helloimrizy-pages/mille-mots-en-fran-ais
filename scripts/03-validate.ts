import fs from 'node:fs/promises';
import { readJson, writeJson } from './_shared/io.js';
import { wordSchema, type Word } from './_shared/schema.js';

const IN = 'data/enriched.json';
const OUT = 'data/validated.json';
const REPORT = 'data/review-report.md';

async function main() {
  const enriched = await readJson<Word[]>(IN);
  const validated: Word[] = [];
  const issues: string[] = [];

  for (const w of enriched) {
    const r = wordSchema.safeParse(w);
    if (!r.success) {
      issues.push(`- ❌ **${w.french}** (id ${w.id}): ${r.error.issues.map((i) => i.message).join('; ')}`);
      continue;
    }
    validated.push(r.data);
  }

  // Heuristic checks beyond schema
  for (const w of validated) {
    if (!w.ipa || w.ipa.length < 1) issues.push(`- ⚠ **${w.french}**: IPA empty`);
    if (w.example.fr.length < 4) issues.push(`- ⚠ **${w.french}**: example sentence suspiciously short`);
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const lemmaBase = normalize(w.french).split('-')[0]?.slice(0, 4) ?? '';
    if (lemmaBase.length >= 3 && !normalize(w.example.fr).includes(lemmaBase)) {
      issues.push(`- ⚠ **${w.french}**: example may not contain the word (lemma base: ${lemmaBase})`);
    }
  }

  await writeJson(OUT, validated);

  const header = `# Review Report\n\n${validated.length} valid entries, ${issues.length} issue(s) flagged.\n\n`;
  await fs.writeFile(REPORT, header + issues.join('\n') + '\n');

  console.log(`Validated ${validated.length}. Issues: ${issues.length}. Report: ${REPORT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
