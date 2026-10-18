import { nextEffectLabel } from '../../../app/useDen';
import { BALANCE } from '../../../economy/balanceConfig';
import { DenEconomyState } from '../../../economy/denEconomy';
import { passiveTreatsPerHour, storageCap } from '../../../economy/formulas';
import { formatNumber, setLocale } from '../../../i18n';
import { MAX_EMIT_MS, MIN_EMIT_MS, bakeryEmitIntervalMs, bowlAtCap, bowlFillLevel, burstSpriteCount, projectedTreats } from '../bakeryRules';

describe('bowlFillLevel', () => {
  it('is 0 when empty and 5 when full', () => {
    expect(bowlFillLevel(0, 200)).toBe(0);
    expect(bowlFillLevel(0.9, 200)).toBe(0);
    expect(bowlFillLevel(200, 200)).toBe(5);
    expect(bowlFillLevel(500, 200)).toBe(5);
  });
  it('grows with the fill share (1..5)', () => {
    const levels = [1, 40, 80, 120, 160, 199].map((n) => bowlFillLevel(n, 200));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(Math.min(...levels)).toBe(1);
    expect(bowlFillLevel(100, 200)).toBe(3);
  });
  it('is 0 for a cap of 0', () => {
    expect(bowlFillLevel(50, 0)).toBe(0);
  });
});

describe('bowlAtCap / projectedTreats', () => {
  it('detects the cap', () => {
    expect(bowlAtCap(200, 200)).toBe(true);
    expect(bowlAtCap(199.9, 200)).toBe(false);
    expect(bowlAtCap(5, 0)).toBe(false);
  });
  it('adds the session gain but never beyond the cap', () => {
    expect(projectedTreats(10, 2.5, 200)).toBe(12.5);
    expect(projectedTreats(199, 5, 200)).toBe(200);
    expect(projectedTreats(10, -3, 200)).toBe(10);
  });
});

describe('bakeryEmitIntervalMs', () => {
  it('clamps to 3-12 s', () => {
    expect(bakeryEmitIntervalMs(0)).toBe(MAX_EMIT_MS);
    expect(bakeryEmitIntervalMs(1)).toBe(12000);
    expect(bakeryEmitIntervalMs(5000)).toBe(MIN_EMIT_MS);
  });
  it('follows 3600000 / rate in between and gets faster as the rate grows', () => {
    expect(bakeryEmitIntervalMs(600)).toBe(6000);
    expect(bakeryEmitIntervalMs(900)).toBeLessThan(bakeryEmitIntervalMs(450));
  });
  it('ignores garbage', () => {
    expect(bakeryEmitIntervalMs(NaN)).toBe(MAX_EMIT_MS);
  });
});

describe('burstSpriteCount', () => {
  it('is 1..8', () => {
    expect(burstSpriteCount(0.2)).toBe(1);
    expect(burstSpriteCount(5.9)).toBe(5);
    expect(burstSpriteCount(4000)).toBe(8);
  });
});

describe('nextEffectLabel', () => {
  const base = { level: 1, treats: 0, doghouseLevel: 1, bakeryLevel: 1, sniffGardenLevel: 1 } as DenEconomyState;
  beforeEach(() => setLocale('en'));
  it('names the next storage, rate and sniff effect with the economy functions', () => {
    const cap = storageCap(2, 1, 1, 1);
    expect(nextEffectLabel('doghouse', base)).toBe(`→ room for ${formatNumber(cap)}`);
    expect(nextEffectLabel('bakery', base)).toBe(`→ +${formatNumber(passiveTreatsPerHour(2, 1), { maximumFractionDigits: 1 })}/hr`);
    expect(nextEffectLabel('sniffGarden', base)).toMatch(/^→ /);
  });
  it('is German in German', () => {
    setLocale('de');
    expect(nextEffectLabel('doghouse', base)).toMatch(/^→ Platz für /);
  });
  it('is null at max level', () => {
    expect(nextEffectLabel('bakery', { ...base, bakeryLevel: BALANCE.maxBuildingLevel })).toBeNull();
  });
});
