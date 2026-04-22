import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import textToSpeech from '@google-cloud/text-to-speech';
import { readJson, fileExists } from './_shared/io.js';
import type { Word } from './_shared/schema.js';

const IN = 'data/validated.json';
const OUT_DIR = 'public/audio/sentences';
const VOICE_NAME = 'fr-FR-Wavenet-C';

async function main() {
  const words = await readJson<Word[]>(IN);
  await fs.mkdir(OUT_DIR, { recursive: true });
  const client = new textToSpeech.TextToSpeechClient();

  let done = 0, skipped = 0;
  for (const w of words) {
    const filename = path.basename(w.audio.sentence);
    const out = path.join(OUT_DIR, filename);
    if (await fileExists(out)) { skipped++; continue; }

    const [res] = await client.synthesizeSpeech({
      input: { text: w.example.fr },
      voice: { languageCode: 'fr-FR', name: VOICE_NAME },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 },
    });
    if (!res.audioContent) throw new Error(`No audio content for ${w.french}`);
    await fs.writeFile(out, res.audioContent as Uint8Array);
    done++;
    if (done % 50 === 0) console.log(`  ${done} generated, ${skipped} skipped…`);
  }

  console.log(`TTS sentences complete. Generated ${done}, skipped ${skipped}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
