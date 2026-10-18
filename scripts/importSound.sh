#!/usr/bin/env bash
# Import a downloaded sound (mp3/m4a/wav/ogg) as one of the app's cues.
# Usage: scripts/importSound.sh <input-file> <cue-name>   e.g. scripts/importSound.sh ~/Downloads/bark.mp3 buddy-1
# Converts to 22.05 kHz mono 16-bit WAV with macOS afconvert, trims leading silence,
# writes assets/sounds/<cue>.wav and adds the cue to assets/sounds/keep.json so
# `node scripts/generateSounds.mjs` never overwrites it. Cue names: see src/feedback/sounds.ts.
set -euo pipefail
in="${1:?input file}"; cue="${2:?cue name}"
out="assets/sounds/${cue}.wav"
tmp="$(mktemp -t dtd-sound).wav"
afconvert -f WAVE -d LEI16@22050 -c 1 "$in" "$tmp"
node - "$tmp" "$out" "$cue" <<'NODE'
const fs = require('fs');
const [tmp, out, cue] = process.argv.slice(2);
const buf = fs.readFileSync(tmp);
// Trim leading silence (< -50 dBFS) and cap at 1.5 s so a tap cue stays snappy.
const dataIdx = buf.indexOf('data') + 8;
const pcm = buf.subarray(dataIdx);
const n = pcm.length / 2; let start = 0;
for (let i = 0; i < n; i++) { if (Math.abs(pcm.readInt16LE(i * 2)) > 100) { start = Math.max(0, i - 220); break; } }
const maxSamples = 22050 * 1.5;
const sliced = pcm.subarray(start * 2, Math.min(pcm.length, (start + maxSamples) * 2));
const header = Buffer.from(buf.subarray(0, dataIdx));
header.writeUInt32LE(36 + sliced.length, 4); header.writeUInt32LE(sliced.length, dataIdx - 4);
fs.writeFileSync(out, Buffer.concat([header, sliced]));
const keepPath = 'assets/sounds/keep.json';
const keep = JSON.parse(fs.readFileSync(keepPath, 'utf8'));
if (!keep.includes(cue)) { keep.push(cue); fs.writeFileSync(keepPath, JSON.stringify(keep, null, 2) + '\n'); }
console.log(`wrote ${out} (${(sliced.length / 2 / 22050).toFixed(2)} s), kept in keep.json`);
NODE
rm -f "$tmp"
