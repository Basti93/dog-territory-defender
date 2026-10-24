import type { Location, Walk } from '../../types';
import { appendStoredFixes } from '../storedFixes';

const fix = (t: number): Location => ({ latitude: 52, longitude: 13, timestamp: t, accuracy: 5 });
const walk = (stamps: number[]): Walk => ({ id: 'w', startTime: 0, closed: false, startSource: 'button', locations: stamps.map(fix) });

describe('appendStoredFixes', () => {
  it('adds every stored fix memory lacks, oldest first', () => {
    const { walk: merged, added } = appendStoredFixes(walk([1, 2, 3]), [fix(1), fix(2), fix(3), fix(5), fix(4)]);
    expect(added.map((f) => f.timestamp)).toEqual([4, 5]);
    expect(merged.locations.map((f) => f.timestamp)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps older stored fixes when a live fix arrived while the store was read', () => {
    const { walk: merged, added } = appendStoredFixes(walk([1, 100]), [fix(1), fix(10), fix(20), fix(100)]);
    expect(added.map((f) => f.timestamp)).toEqual([10, 20]);
    expect(merged.locations.map((f) => f.timestamp)).toEqual([1, 10, 20, 100]);
  });

  it('returns the same walk when the store has nothing new', () => {
    const w = walk([1, 2]);
    const result = appendStoredFixes(w, [fix(1), fix(2)]);
    expect(result.walk).toBe(w);
    expect(result.added).toEqual([]);
  });
});
