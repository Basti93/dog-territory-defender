// Regenerates assets/sounds/*.wav (22.05 kHz mono 16-bit). Pure Node:
//   node scripts/generateSounds.mjs
// The WAVs are checked in; rerun only when changing the sounds.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { SOUNDS, encodeWav } = require('./soundSynth.cjs');

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
mkdirSync(outDir, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const wav = encodeWav(make());
  writeFileSync(join(outDir, `${name}.wav`), wav);
  console.log(`${name}.wav  ${wav.length} bytes`);
}
