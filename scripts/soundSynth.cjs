// Pure-Node synthesis for the app's UI sounds and the ambient music box. No dependencies.
// Used by scripts/generateSounds.mjs (writes assets/sounds/*.wav) and by the
// unit test in src/feedback/__tests__/wavSynth.test.ts.
//
// One sound family: soft kalimba/marimba tones (sine + harmonics, <=5 ms
// attack, exponential decay, slight detune, tiny wood click) and a soft
// woodblock for taps. Notes come from C major pentatonic (C D E G A).
// Everything is lowpassed, soft-limited and peak-normalised per cue.
'use strict';

const SAMPLE_RATE = 22050;
const AMBIENT_SAMPLE_RATE = 16000;
const AMBIENT_SECONDS = 60;
const AMBIENT_CROSSFADE_SECONDS = 2;

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

const count = (ms, sr = SAMPLE_RATE) => Math.round((ms / 1000) * sr);
const dbToLinear = (db) => Math.pow(10, db / 20);
const semitones = (f, n) => f * Math.pow(2, n / 12);

/** Deterministic noise in -1..1 so regenerated files are byte-identical. */
function makeNoise(seed = 1) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2147483648 - 1;
  };
}

/** Deterministic uniform random in [0,1) (mulberry32). */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// C major pentatonic, in Hz.
const NOTE = {
  C3: 130.81, G3: 196.0,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
  C6: 1046.5, D6: 1174.66, G6: 1567.98, A6: 1760.0,
};

// ---- filters (RBJ biquads) -------------------------------------------------

function biquad(samples, type, f0, q, sr) {
  const w0 = (2 * Math.PI * f0) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  let b0, b1, b2;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
  } else {
    // bandpass, constant 0 dB peak gain
    b0 = alpha; b1 = 0; b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  b0 /= a0; b1 /= a0; b2 /= a0;
  const out = new Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * Gentle lowpass, then normalise, soft-limit (tanh keeps the peak at 1) and
 * scale to the target peak. Last 8 ms fade so nothing clicks at the end.
 */
function finalize(samples, peakDb = -6, sr = SAMPLE_RATE, cutoff = 6000) {
  const lp = biquad(samples, 'lowpass', cutoff, 0.707, sr);
  let peak = 0;
  for (const v of lp) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) return lp;
  const drive = 1.4;
  const norm = Math.tanh(drive);
  const target = dbToLinear(peakDb);
  const fade = count(8, sr);
  return lp.map((v, i) => {
    const tail = Math.min(1, (lp.length - 1 - i) / fade);
    return (Math.tanh((v / peak) * drive) / norm) * target * tail;
  });
}

// ---- instruments ------------------------------------------------------------

const silence = (ms, sr = SAMPLE_RATE) => new Array(count(ms, sr)).fill(0);

/**
 * Kalimba/marimba note added into `out`. Sine + 2nd and 3rd harmonics (which
 * die faster), a slightly detuned twin for warmth, 3 ms attack, and an
 * optional ~2 ms wood click.
 */
function addKalimba(out, startMs, freq, amp, opts = {}) {
  const { decay = 8, durMs = 500, click = true, sr = SAMPLE_RATE, tremoloHz = 0 } = opts;
  const start = count(startMs, sr);
  const n = count(durMs, sr);
  const noise = makeNoise(Math.round(freq * 10 + startMs));
  const attack = 0.003;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / sr;
    const env = Math.min(1, t / attack) * Math.exp(-decay * t);
    const w = 2 * Math.PI * freq * t;
    let v =
      Math.sin(w) +
      0.5 * Math.sin(w * 1.0017) + // ~3 cents detune
      0.3 * Math.sin(2 * w) * Math.exp(-decay * 1.2 * t) +
      0.1 * Math.sin(3 * w) * Math.exp(-decay * 2.5 * t);
    v /= 1.9;
    if (tremoloHz) v *= 0.55 + 0.45 * Math.sin(2 * Math.PI * tremoloHz * t);
    if (click) v += noise() * Math.exp(-t * 900) * 0.12;
    out[start + i] += amp * v * env;
  }
}

/** Soft woodblock tock: short sine pair with a fast decay plus a click. */
function addWoodblock(out, startMs, freq, amp, decay, sr = SAMPLE_RATE) {
  const start = count(startMs, sr);
  const noise = makeNoise(99);
  for (let i = 0; start + i < out.length; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.002) * Math.exp(-decay * t);
    const v = Math.sin(2 * Math.PI * freq * t) + 0.45 * Math.sin(2 * Math.PI * freq * 1.52 * t);
    out[start + i] += amp * (v / 1.45 * env + noise() * Math.exp(-t * 1200) * 0.2);
  }
}

/**
 * One cartoon dog bark, added into `out` (formant synthesis, no samples).
 * Source: sawtooth glottal pulses, f0 falling exponentially f0Start -> f0End,
 * ~15% per-period jitter, plus a 15 ms aspirated noise burst (-12 dB) for the "w".
 * Filter: three parallel resonant band-passes (F1 620 Hz Q8, F2 1150 Hz Q10,
 * F3 2600 Hz Q12 at -10 dB) that all sweep down 15% over the bark ("wo-uff").
 * Envelope: 8 ms attack, hold, then exponential-ish decay; tanh for chesty body.
 */
function addBark(out, startMs, f0Start, f0End, durMs, seed) {
  const start = count(startMs);
  const n = count(durMs);
  const rng = makeRng(seed);
  const noise = makeNoise(seed);
  const attack = 0.008;
  const hold = durMs > 110 ? 0.04 : 0.028;
  const decayLen = durMs / 1000 - attack - hold;
  const formants = [
    { f: 620, q: 8, g: 1 },
    { f: 1150, q: 10, g: 0.8 },
    { f: 2600, q: 12, g: dbToLinear(-10) },
  ];
  const st = formants.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
  const noiseGain = dbToLinear(-12) * 0.577; // relative to sawtooth RMS
  const burst = count(15);
  let phase = 0;
  let jit = 1;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const u = i / n;
    const f0 = f0Start * Math.pow(f0End / f0Start, u) * jit;
    phase += f0 / SAMPLE_RATE;
    if (phase >= 1) {
      phase -= 1;
      jit = 1 + 0.15 * (rng() * 2 - 1); // new jitter every glottal period
    }
    let x = 1 - 2 * phase;
    if (i < burst) x += noise() * noiseGain * 4 * (1 - i / burst);
    const sweep = 1 - 0.15 * Math.min(1, u * 1.2);
    let y = 0;
    for (let k = 0; k < formants.length; k++) {
      const fm = formants[k];
      const w0 = (2 * Math.PI * fm.f * sweep) / SAMPLE_RATE;
      const alpha = Math.sin(w0) / (2 * fm.q);
      const a0 = 1 + alpha;
      const a1 = (-2 * Math.cos(w0)) / a0;
      const a2 = (1 - alpha) / a0;
      const b0 = alpha / a0;
      const z = st[k];
      const v = b0 * x - b0 * z.x2 - a1 * z.y1 - a2 * z.y2;
      z.x2 = z.x1; z.x1 = x; z.y2 = z.y1; z.y1 = v;
      y += fm.g * v;
    }
    const env = t < attack ? t / attack : t < attack + hold ? 1 : Math.exp(-5 * ((t - attack - hold) / decayLen));
    const fadeOut = Math.min(1, (n - 1 - i) / count(5));
    out[start + i] += Math.tanh(3 * y * env) * fadeOut;
  }
}

// ---- cues -------------------------------------------------------------------

const cue = (ms, build, peakDb = -6) => () => {
  const out = silence(ms);
  build(out);
  return finalize(out, peakDb);
};

const tap = cue(35, (out) => addWoodblock(out, 0, 880, 0.6, 110), -14);

// Dog barks (formant synth). Total lengths: 300 / 320 / 340 ms.
const barkCue = (ms, build) => () => {
  const out = silence(ms);
  build(out);
  return finalize(out, -4, SAMPLE_RATE, 4000);
};
const buddy1 = barkCue(300, (out) => {
  addBark(out, 0, 230, 140, 130, 11);
  addBark(out, 110, 230, 140, 130, 12);
});
const buddy2 = barkCue(320, (out) => {
  addBark(out, 0, 260, 160, 130, 23);
  addBark(out, 130, 200, 120, 130, 24);
});
const buddy3 = barkCue(340, (out) => {
  addBark(out, 0, 240, 150, 90, 37);
  addBark(out, 100, 240, 150, 90, 38);
  addBark(out, 200, 240, 150, 90, 39);
});

const treat = cue(150, (out) => {
  // Glass ding: two pure partials, shimmer from a slow beat between detuned twins.
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.min(1, t / 0.003) * Math.exp(-t * 20);
    const shimmer = 0.75 + 0.25 * Math.sin(2 * Math.PI * 22 * t);
    out[i] +=
      env * (Math.sin(2 * Math.PI * 1760 * t) + 0.35 * Math.sin(2 * Math.PI * 1763 * t)) +
      env * 0.55 * shimmer * Math.sin(2 * Math.PI * 2640 * t);
  }
});

const upgrade = cue(400, (out) => {
  addKalimba(out, 0, NOTE.C5, 0.7, { decay: 7, durMs: 330 });
  addKalimba(out, 70, NOTE.E5, 0.7, { decay: 7, durMs: 330 });
  addKalimba(out, 140, NOTE.G5, 0.8, { decay: 6, durMs: 260 });
});

const celebrate = cue(800, (out) => {
  addKalimba(out, 0, NOTE.C5, 0.6, { decay: 5, durMs: 500 });
  addKalimba(out, 110, NOTE.D5, 0.6, { decay: 5, durMs: 500 });
  addKalimba(out, 220, NOTE.E5, 0.65, { decay: 5, durMs: 500 });
  addKalimba(out, 330, NOTE.G5, 0.75, { decay: 4.5, durMs: 470 });
  addKalimba(out, 460, NOTE.A6, 0.35, { decay: 4, durMs: 340, tremoloHz: 16 });
});

const newStreet = cue(160, (out) => {
  addKalimba(out, 0, NOTE.D6, 0.5, { decay: 22, durMs: 120 });
  addKalimba(out, 60, NOTE.G6, 0.5, { decay: 22, durMs: 100 });
});

const rewardReached = cue(450, (out) => {
  addKalimba(out, 0, NOTE.E5, 0.6, { decay: 6, durMs: 450 });
  addKalimba(out, 100, NOTE.G5, 0.6, { decay: 6, durMs: 350 });
  addKalimba(out, 200, NOTE.C6, 0.65, { decay: 5, durMs: 250 });
});

const walkDone = cue(300, (out) => addKalimba(out, 0, NOTE.G5, 0.8, { decay: 9, durMs: 300 }));

const sleepy = cue(450, (out) => {
  // Descending hum A4 -> E4, slow decay.
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const freq = NOTE.A4 + (NOTE.E4 - NOTE.A4) * Math.min(1, t / 0.4);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const env = Math.min(1, t / 0.02) * Math.exp(-t * 3.5);
    out[i] = env * (Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.06 * Math.sin(3 * phase));
  }
});

const SOUNDS = {
  tap,
  'buddy-1': buddy1,
  'buddy-2': buddy2,
  'buddy-3': buddy3,
  treat,
  upgrade,
  celebrate,
  sleepy,
  'new-street': newStreet,
  'reward-reached': rewardReached,
  'walk-done': walkDone,
};

// ---- ambient music box --------------------------------------------------------

function feedbackComb(x, delay, g, damp) {
  const y = new Array(x.length).fill(0);
  let lp = 0;
  for (let i = 0; i < x.length; i++) {
    const fb = i >= delay ? y[i - delay] : 0;
    lp = lp * damp + fb * (1 - damp);
    y[i] = x[i] + g * lp;
  }
  return y;
}

function allpass(x, delay, g) {
  const y = new Array(x.length).fill(0);
  for (let i = 0; i < x.length; i++) {
    const xd = i >= delay ? x[i - delay] : 0;
    const yd = i >= delay ? y[i - delay] : 0;
    y[i] = -g * x[i] + xd + g * yd;
  }
  return y;
}

/**
 * 60 s seeded, loop-safe kalimba drift. Returns Float samples at 16 kHz.
 * Loop seam: the signal is rendered 2 s longer than the loop; the first 2 s of
 * the output blend (equal power) the start of the render with the 2 s "after
 * the end", so the last sample flows into the first. The pad is exactly
 * periodic (whole cycles per loop) and is added after the blend.
 */
function ambientMusicBox() {
  const sr = AMBIENT_SAMPLE_RATE;
  const N = AMBIENT_SECONDS * sr;
  const X = AMBIENT_CROSSFADE_SECONDS * sr;
  const rng = makeRng(0xc0ffee);
  const scale = [NOTE.C4, NOTE.D4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5];
  const dry = new Array(N + X).fill(0);

  const playNote = (tSec, freq, vel) =>
    addKalimba(dry, tSec * 1000, freq, vel * 0.8, { decay: 1.5, durMs: 3000, sr });

  let idx = Math.floor(rng() * scale.length);
  let t = 0.3;
  while (t < AMBIENT_SECONDS + AMBIENT_CROSSFADE_SECONDS) {
    // wandering line: step 1-3 scale degrees either way, never the same note twice
    let step = (1 + Math.floor(rng() * 3)) * (rng() < 0.5 ? -1 : 1);
    let next = idx + step;
    if (next < 0 || next >= scale.length) next = idx - step;
    idx = Math.max(0, Math.min(scale.length - 1, next));
    const vel = 0.4 + rng() * 0.4;
    playNote(t, scale[idx], vel);
    if (rng() < 0.2) {
      // dyad: a third or a fifth above that is also in the set
      const partners = scale.filter((f) => {
        const st = Math.round(12 * Math.log2(f / scale[idx]));
        return st === 3 || st === 4 || st === 7;
      });
      if (partners.length) playNote(t + 0.02, partners[Math.floor(rng() * partners.length)], vel * 0.8);
    }
    t += -Math.log(1 - rng()) * 1.4; // exponential gaps, mean 1.4 s
  }

  // Feedback delay (~380 ms, 3 taps) then a small Schroeder-style reverb.
  const d = Math.round(0.38 * sr);
  const delayed = dry.map((v, i) => {
    let s = v;
    if (i >= d) s += 0.45 * dry[i - d];
    if (i >= 2 * d) s += 0.25 * dry[i - 2 * d];
    if (i >= 3 * d) s += 0.12 * dry[i - 3 * d];
    return s;
  });
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((s, k) =>
    feedbackComb(delayed, Math.round(s * sr), 0.82 - k * 0.02, 0.3)
  );
  let wet = delayed.map((_, i) => (combs[0][i] + combs[1][i] + combs[2][i] + combs[3][i]) / 4);
  wet = allpass(allpass(wet, Math.round(0.005 * sr), 0.5), Math.round(0.0017 * sr), 0.5);
  let render = delayed.map((v, i) => v * 0.7 + wet[i] * 0.9);
  render = biquad(render, 'lowpass', 3800, 0.707, sr);

  // Seam: out[i] (i < X) = start-of-render fading in + after-the-end fading out.
  const out = new Array(N);
  for (let i = 0; i < N; i++) {
    if (i < X) {
      const x = i / X;
      out[i] = render[i] * Math.sin((x * Math.PI) / 2) + render[N + i] * Math.cos((x * Math.PI) / 2);
    } else {
      out[i] = render[i];
    }
  }

  // Normalise the notes, add the periodic pad, then set the whole to -12 dBFS.
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const noteGain = dbToLinear(-13.5) / peak;
  const padAmp = dbToLinear(-30);
  // Whole cycles per loop so the pad wraps without a jump.
  const cycles = (f) => Math.round(f * AMBIENT_SECONDS) / AMBIENT_SECONDS;
  const padC = cycles(NOTE.C3 + 0.12);
  const padG = cycles(NOTE.G3 - 0.15);
  for (let i = 0; i < N; i++) {
    const tt = i / sr;
    const swell = 0.8 + 0.2 * Math.cos((2 * Math.PI * tt) / AMBIENT_SECONDS);
    out[i] = out[i] * noteGain + padAmp * swell * (Math.sin(2 * Math.PI * padC * tt) + Math.sin(2 * Math.PI * padG * tt)) * 0.5;
  }
  peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const finalGain = dbToLinear(-12) / peak;
  for (let i = 0; i < N; i++) out[i] *= finalGain;
  return out;
}

module.exports = {
  SAMPLE_RATE,
  AMBIENT_SAMPLE_RATE,
  AMBIENT_SECONDS,
  AMBIENT_CROSSFADE_SECONDS,
  SOUNDS,
  encodeWav,
  ambientMusicBox,
};
