// Regenerates assets/sounds/*.wav. Pure Node, deterministic (re-running gives byte-identical files):
//   node scripts/generateSounds.mjs            UI cues, 22.05 kHz mono 16-bit
//   node scripts/generateSounds.mjs --ambient  ambient-musicbox.wav, 60 s, 16 kHz mono 16-bit
// The WAVs are checked in; rerun only when changing the sounds.
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { SOUNDS, AMBIENT_SAMPLE_RATE, encodeWav, ambientMusicBox } = require('./soundSynth.cjs');

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
mkdirSync(outDir, { recursive: true });

if (process.argv.includes('--ambient')) {
  const wav = encodeWav(ambientMusicBox(), AMBIENT_SAMPLE_RATE);
  writeFileSync(join(outDir, 'ambient-musicbox.wav'), wav);
  console.log(`ambient-musicbox.wav  ${wav.length} bytes`);
} else {
  rmSync(join(outDir, 'bark.wav'), { force: true }); // replaced by buddy-1..3
  for (const [name, make] of Object.entries(SOUNDS)) {
    const wav = encodeWav(make());
    writeFileSync(join(outDir, `${name}.wav`), wav);
    console.log(`${name}.wav  ${wav.length} bytes`);
  }
}
