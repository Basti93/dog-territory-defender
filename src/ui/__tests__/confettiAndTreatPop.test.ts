import { CONFETTI_DEFAULT_COUNT, confettiTotalMs, generateConfettiParticles, seededRng } from '../confettiParticles';
import { CONFETTI_COLORS } from '../tokens';
import { formatTreatPop } from '../treatPopFormat';

describe('generateConfettiParticles', () => {
  it('defaults to 24 and honours count', () => {
    expect(generateConfettiParticles(undefined, seededRng(1))).toHaveLength(CONFETTI_DEFAULT_COUNT);
    expect(generateConfettiParticles(30, seededRng(1))).toHaveLength(30);
  });
  it('is deterministic for a seed', () => {
    expect(generateConfettiParticles(24, seededRng(7))).toEqual(generateConfettiParticles(24, seededRng(7)));
  });
  it('uses only spec colours, all of them', () => {
    const ps = generateConfettiParticles(24, seededRng(3));
    ps.forEach((p) => expect(CONFETTI_COLORS).toContain(p.color));
    expect(new Set(ps.map((p) => p.color)).size).toBe(CONFETTI_COLORS.length);
    expect([...CONFETTI_COLORS].sort()).toEqual(['#2ECC71', '#3498DB', '#8B6F47', '#DCE8BE', '#F39C12']);
  });
  it('stays in bounds and finishes in about 2.5s at most', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const ps = generateConfettiParticles(24, seededRng(seed));
      ps.forEach((p) => {
        expect(p.x).toBeGreaterThanOrEqual(0.05);
        expect(p.x).toBeLessThanOrEqual(0.95);
        expect(p.delayMs).toBeLessThan(400);
        expect(p.durationMs).toBeGreaterThanOrEqual(1800);
        expect(p.durationMs).toBeLessThanOrEqual(2200);
        expect(Math.abs(p.driftPx)).toBeLessThanOrEqual(30);
        expect(p.rotateDeg).toBeLessThanOrEqual(270);
      });
      expect(confettiTotalMs(ps)).toBeLessThanOrEqual(2600);
    }
  });
});

describe('formatTreatPop', () => {
  it('formats', () => {
    expect(formatTreatPop(5)).toBe('+5 🦴');
    expect(formatTreatPop(5.4, null)).toBe('+5');
  });
  it('returns empty for zero/negative/NaN', () => {
    expect(formatTreatPop(0)).toBe('');
    expect(formatTreatPop(-3)).toBe('');
    expect(formatTreatPop(NaN)).toBe('');
  });
});
