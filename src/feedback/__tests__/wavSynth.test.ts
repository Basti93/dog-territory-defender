const { SAMPLE_RATE, SOUNDS, encodeWav } = require('../../../scripts/soundSynth.cjs');

const EXPECTED_MS: Record<string, number> = { tap: 40, treat: 120, upgrade: 350, celebrate: 700, bark: 180, sleepy: 400 };

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

  it('produces every sound with the right length, under 60 KB, and audible', () => {
    for (const [name, ms] of Object.entries(EXPECTED_MS)) {
      const samples: number[] = SOUNDS[name]();
      expect(samples.length).toBe(Math.round((ms / 1000) * SAMPLE_RATE));
      expect(encodeWav(samples).length).toBeLessThanOrEqual(60 * 1024);
      expect(Math.max(...samples.map(Math.abs))).toBeGreaterThan(0.1);
      expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(1);
    }
  });
});
