const { SAMPLE_RATE, AMBIENT_SAMPLE_RATE, SOUNDS, encodeWav, ambientMusicBox } = require('../../../scripts/soundSynth.cjs');

const EXPECTED_MS: Record<string, number> = {
  tap: 35,
  'buddy-1': 300,
  'buddy-2': 320,
  'buddy-3': 340,
  treat: 150,
  upgrade: 400,
  celebrate: 800,
  sleepy: 450,
  'new-street': 160,
  'reward-reached': 450,
  'walk-done': 300,
};
const peakOf = (xs: number[]) => xs.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const dbfs = (lin: number) => 20 * Math.log10(lin);

describe('WAV generator', () => {
  it('writes a valid 22.05 kHz mono 16-bit PCM header', () => {
    const wav: Buffer = encodeWav([0, 0.5, -0.5, 1]);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(22050);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(8);
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    expect(wav.length).toBe(44 + 8);
  });

  it('has exactly the expected cue set (no old bark)', () => {
    expect(Object.keys(SOUNDS).sort()).toEqual(Object.keys(EXPECTED_MS).sort());
  });

  it('produces every cue with the right length, small, peak <= -6 dBFS (tap -14) and audible', () => {
    for (const [name, ms] of Object.entries(EXPECTED_MS)) {
      const samples: number[] = SOUNDS[name]();
      expect(samples.length).toBe(Math.round((ms / 1000) * SAMPLE_RATE));
      expect(encodeWav(samples).length).toBeLessThanOrEqual(60 * 1024);
      const peak = dbfs(peakOf(samples));
      const target = name === 'tap' ? -14 : name.startsWith('buddy-') ? -4 : -6;
      expect(peak).toBeLessThanOrEqual(target + 0.01);
      expect(peak).toBeGreaterThan(target - 0.5);
      expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.01);
    }
  });

  it('buddy barks are voiced, not drums: 500-1400 Hz energy beats <250 Hz by >= 6 dB, 250-450 ms', () => {
    // Naive DFT power summed over 10 Hz-spaced probes (Hann-windowed).
    const bandEnergy = (xs: number[], lo: number, hi: number) => {
      let total = 0;
      for (let f = lo; f <= hi; f += 10) {
        let re = 0;
        let im = 0;
        for (let i = 0; i < xs.length; i++) {
          const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (xs.length - 1));
          const a = (2 * Math.PI * f * i) / SAMPLE_RATE;
          re += xs[i] * w * Math.cos(a);
          im -= xs[i] * w * Math.sin(a);
        }
        total += re * re + im * im;
      }
      return total;
    };
    for (const name of ['buddy-1', 'buddy-2', 'buddy-3']) {
      const xs: number[] = SOUNDS[name]();
      const ms = (xs.length / SAMPLE_RATE) * 1000;
      expect(ms).toBeGreaterThanOrEqual(250);
      expect(ms).toBeLessThanOrEqual(450);
      const diff = 10 * Math.log10(bandEnergy(xs, 500, 1400) / bandEnergy(xs, 20, 250));
      expect(diff).toBeGreaterThanOrEqual(6);
    }
  });

  it('is deterministic', () => {
    expect(SOUNDS['buddy-1']()).toEqual(SOUNDS['buddy-1']());
  });
});

describe('ambient music box', () => {
  const samples: number[] = ambientMusicBox();

  it('is 60 s at 16 kHz, under 2.5 MB, peak -12 dBFS', () => {
    expect(AMBIENT_SAMPLE_RATE).toBe(16000);
    expect(samples.length).toBe(60 * 16000);
    expect(encodeWav(samples, AMBIENT_SAMPLE_RATE).length).toBeLessThanOrEqual(2.5 * 1024 * 1024);
    expect(dbfs(peakOf(samples))).toBeCloseTo(-12, 1);
  });

  it('is deterministic (seeded)', () => {
    expect(ambientMusicBox()).toEqual(samples);
  });

  it('loops without a click: the seam step is as small as a normal sample step', () => {
    const seam = Math.abs(samples[0] - samples[samples.length - 1]);
    let maxStep = 0;
    for (let i = 1; i < samples.length; i++) maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]));
    expect(seam).toBeLessThan(maxStep * 0.2);
    // And no jump near the seam either, on both sides.
    const sr = AMBIENT_SAMPLE_RATE;
    for (const i of [...Array(200).keys()]) {
      expect(Math.abs(samples[i + 1] - samples[i])).toBeLessThanOrEqual(maxStep);
      expect(Math.abs(samples[samples.length - 1 - i] - samples[samples.length - 2 - i])).toBeLessThanOrEqual(maxStep);
    }
    expect(sr).toBe(16000);
  });

  it('crossfaded ends carry comparable energy (no dip or bump in the first 2 s)', () => {
    const sr = AMBIENT_SAMPLE_RATE;
    const rms = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += samples[i] * samples[i];
      return Math.sqrt(sum / (to - from));
    };
    const first = rms(0, 2 * sr);
    const last = rms(samples.length - 2 * sr, samples.length);
    const middle = rms(20 * sr, 40 * sr);
    expect(first / last).toBeGreaterThan(0.4);
    expect(first / last).toBeLessThan(2.5);
    expect(first / middle).toBeGreaterThan(0.3);
    expect(first / middle).toBeLessThan(3);
  });
});
