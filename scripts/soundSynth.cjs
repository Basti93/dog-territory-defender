// Pure-Node synthesis for the app's tiny UI sounds. No dependencies.
// Used by scripts/generateSounds.mjs (writes assets/sounds/*.wav) and by the
// unit test in src/feedback/__tests__/wavSynth.test.ts.
'use strict';

const SAMPLE_RATE = 22050;

/** Encode float samples (-1..1) as a 16-bit mono PCM WAV Buffer. */
function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

const count = (ms) => Math.round((ms / 1000) * SAMPLE_RATE);

/** Deterministic noise so regenerated files are byte-identical. */
function makeNoise(seed = 1) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2147483648 - 1;
  };
}

/** Short fade in/out so nothing clicks at the edges. */
function edge(i, n, fadeSamples = 40) {
  return Math.min(1, i / fadeSamples, (n - 1 - i) / fadeSamples);
}

/** A sine note with exponential decay, added into `out` starting at `startMs`. */
function addNote(out, startMs, durMs, freq, amp, decayPerSec) {
  const start = count(startMs);
  const n = count(durMs);
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    out[start + i] += amp * Math.sin(2 * Math.PI * freq * t) * Math.exp(-decayPerSec * t) * edge(i, n);
  }
}

function silence(ms) {
  return new Array(count(ms)).fill(0);
}

function tap() {
  const out = silence(40);
  addNote(out, 0, 40, 900, 0.5, 90);
  return out;
}

function treat() {
  const out = silence(120);
  addNote(out, 0, 120, 1318, 0.45, 28); // E6
  addNote(out, 0, 120, 2637, 0.2, 40); // E7 partial
  return out;
}

function upgrade() {
  const out = silence(350);
  addNote(out, 0, 130, 523.25, 0.4, 10); // C5
  addNote(out, 110, 130, 659.25, 0.4, 10); // E5
  addNote(out, 220, 130, 783.99, 0.45, 12); // G5
  return out;
}

function celebrate() {
  const out = silence(700);
  addNote(out, 0, 200, 523.25, 0.4, 6); // C5
  addNote(out, 150, 200, 659.25, 0.4, 6); // E5
  addNote(out, 300, 200, 783.99, 0.4, 6); // G5
  addNote(out, 450, 250, 1046.5, 0.45, 7); // C6
  addNote(out, 450, 250, 1318.5, 0.15, 9); // sparkle
  return out;
}

function bark() {
  const n = count(180);
  const out = silence(180);
  const noise = makeNoise(7);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 120 + 180 * Math.exp(-t * 25); // quick drop 300 -> ~120 Hz
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const body = Math.sin(phase) * Math.exp(-t * 14);
    const burst = noise() * Math.exp(-t * 90) * 0.35; // breathy start
    out[i] = (0.6 * body + burst) * edge(i, n);
  }
  return out;
}

function sleepy() {
  const out = silence(400);
  addNote(out, 0, 220, 523.25, 0.35, 5); // C5
  addNote(out, 180, 220, 392, 0.35, 6); // G4
  return out;
}

// In-walk cues: quiet on purpose, the phone is in a pocket.
function newStreet() {
  const out = silence(150);
  addNote(out, 0, 80, 880, 0.3, 30); // A5
  addNote(out, 60, 90, 1318.5, 0.3, 30); // E6
  return out;
}

function rewardReached() {
  const out = silence(400);
  addNote(out, 0, 150, 440, 0.32, 9); // A4
  addNote(out, 120, 150, 554.37, 0.32, 9); // C#5
  addNote(out, 240, 160, 659.25, 0.36, 10); // E5
  return out;
}

function walkDone() {
  const out = silence(300);
  addNote(out, 0, 300, 784, 0.28, 10); // G5
  addNote(out, 0, 300, 1568, 0.08, 14); // soft octave
  return out;
}

const SOUNDS = {
  tap,
  treat,
  upgrade,
  celebrate,
  bark,
  sleepy,
  'new-street': newStreet,
  'reward-reached': rewardReached,
  'walk-done': walkDone,
};

module.exports = { SAMPLE_RATE, SOUNDS, encodeWav };
