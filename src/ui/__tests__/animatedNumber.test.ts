import { countUpValue, formatCount, easeOutCubic } from '../countUp';

describe('countUpValue', () => {
  it('hits endpoints exactly', () => {
    expect(countUpValue(0, 137, 0)).toBe(0);
    expect(countUpValue(0, 137, 1)).toBe(137);
    expect(countUpValue(5, 5, 0.5)).toBe(5);
  });
  it('clamps progress outside 0..1', () => {
    expect(countUpValue(10, 50, -3)).toBe(10);
    expect(countUpValue(10, 50, 7)).toBe(50);
    expect(countUpValue(10, 50, NaN)).toBe(10);
  });
  it('is monotonic increasing, whole numbers, never overshoots', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = countUpValue(0, 1234, i / 100);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1234);
      prev = v;
    }
  });
  it('counts down monotonically', () => {
    let prev = Infinity;
    for (let i = 0; i <= 50; i++) {
      const v = countUpValue(100, 20, i / 50);
      expect(v).toBeLessThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(20);
      prev = v;
    }
  });
  it('supports 1 decimal', () => {
    let prev = 0;
    for (let i = 0; i <= 40; i++) {
      const v = countUpValue(0, 2.5, i / 40, undefined, 1);
      expect(Math.round(v * 10) / 10).toBeCloseTo(v, 10);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(countUpValue(0, 2.5, 1, undefined, 1)).toBe(2.5);
  });
  it('handles large numbers and custom easing', () => {
    expect(countUpValue(0, 9_999_999, 1)).toBe(9_999_999);
    expect(countUpValue(0, 100, 0.5, (t) => t)).toBe(50);
  });
  it('default easing is monotonic and 0..1', () => {
    let prev = 0;
    for (let i = 0; i <= 100; i++) {
      const e = easeOutCubic(i / 100);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
    expect(easeOutCubic(1)).toBe(1);
  });
});

describe('formatCount', () => {
  it('formats ints and decimals', () => {
    expect(formatCount(12)).toBe('12');
    expect(formatCount(2.5, 1)).toBe('2.5');
    expect(formatCount(3, 1)).toBe('3.0');
  });
});
