import { cumulativeDistance, getDistance } from '../geometry';

function offsetLatitude(lat: number, meters: number): number {
  return lat + meters / 111320;
}

describe('cumulativeDistance', () => {
  it('is 0 for fewer than 2 points', () => {
    expect(cumulativeDistance([])).toBe(0);
    expect(cumulativeDistance([{ latitude: 52.5, longitude: 13.4, timestamp: 0, accuracy: 5 }])).toBe(0);
  });

  it('sums consecutive point-to-point distances, not just start-to-end', () => {
    const base = { latitude: 52.5, longitude: 13.4, timestamp: 0, accuracy: 5 };
    const locations = [
      base,
      { ...base, latitude: offsetLatitude(base.latitude, 100) }, // 100m north
      base, // 100m back south — net displacement 0, but real distance traveled is 200m
    ];

    const total = cumulativeDistance(locations);

    // start-to-end distance would be ~0; cumulative distance must reflect the out-and-back
    expect(total).toBeGreaterThan(150);
    expect(total).toBeLessThan(250);
  });

  it('matches getDistance for a simple two-point walk', () => {
    const a = { latitude: 52.5, longitude: 13.4, timestamp: 0, accuracy: 5 };
    const b = { latitude: 52.501, longitude: 13.4, timestamp: 1000, accuracy: 5 };

    expect(cumulativeDistance([a, b])).toBeCloseTo(getDistance(a.latitude, a.longitude, b.latitude, b.longitude), 5);
  });
});
