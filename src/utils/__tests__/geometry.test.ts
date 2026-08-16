import { cumulativeDistance, getDistance, canCloseWalk } from '../geometry';
import { Location } from '../../types';

function offsetLatitude(lat: number, meters: number): number {
  return lat + meters / 111320;
}

function makeLocations(n: number, overrides: Partial<Location> = {}): Location[] {
  return Array.from({ length: n }, (_, i) => ({
    latitude: 52.5,
    longitude: 13.4,
    timestamp: i * 1000,
    accuracy: 5,
    ...overrides,
  }));
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

describe('canCloseWalk', () => {
  it('fails with fewer than 10 points even if start and end coincide', () => {
    const locations = makeLocations(9);
    expect(canCloseWalk(locations)).toBe(false);
  });

  it('closes within the 100m floor under good accuracy, beyond the old 20m threshold', () => {
    const base = makeLocations(10, { accuracy: 5 });
    base[base.length - 1] = {
      ...base[base.length - 1],
      latitude: offsetLatitude(base[0].latitude, 60), // 60m away — would fail a flat 20m check
    };

    expect(canCloseWalk(base)).toBe(true);
  });

  it('fails when genuinely too far apart regardless of accuracy', () => {
    const base = makeLocations(10, { accuracy: 5 });
    base[base.length - 1] = {
      ...base[base.length - 1],
      latitude: offsetLatitude(base[0].latitude, 500),
    };

    expect(canCloseWalk(base)).toBe(false);
  });

  it('widens beyond the 100m floor when reported accuracy is poor', () => {
    const locations = makeLocations(10, { accuracy: 5 });
    locations[0] = { ...locations[0], accuracy: 60 };
    locations[locations.length - 1] = {
      ...locations[locations.length - 1],
      accuracy: 60,
      latitude: offsetLatitude(locations[0].latitude, 125), // within 60+60+10=130 but beyond the 100m floor
    };

    expect(canCloseWalk(locations)).toBe(true);
  });
});
