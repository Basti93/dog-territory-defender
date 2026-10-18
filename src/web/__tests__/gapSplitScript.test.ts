import { Location } from '../../types';
import { splitAtGaps, stepCountsAsDistance } from '../../utils/geometry';
import { GAP_SPLIT_SCRIPT } from '../gapSplitScript';
import { mapHTML } from '../mapHTML';
import { portraitHTML } from '../portraitHTML';

const web = new Function(`${GAP_SPLIT_SCRIPT}; return { gapStepCounts: gapStepCounts, gapSplit: gapSplit };`)() as {
  gapStepCounts: (a: Location, b: Location) => boolean;
  gapSplit: (points: Location[]) => Location[][];
};

// Deterministic pseudo-random numbers, so a failure reproduces.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** A messy trail: strolls, pauses, jumps, dropouts, missing and out-of-order times. */
function messyTrail(seed: number, n: number): Location[] {
  const r = rng(seed);
  const out: Location[] = [];
  let lat = 52.5;
  let lon = 13.4;
  let t = 1_000_000;
  for (let i = 0; i < n; i++) {
    const kind = r();
    const metres = kind < 0.6 ? r() * 30 : kind < 0.8 ? r() * 120 : r() * 600;
    const seconds = kind < 0.05 ? 0 : kind < 0.1 ? -5 : kind < 0.8 ? 1 + r() * 40 : r() * 300;
    lat += (metres * Math.cos(r() * 6.28)) / 111320;
    lon += (metres * Math.sin(r() * 6.28)) / 68000;
    t += seconds * 1000;
    out.push({ latitude: lat, longitude: lon, timestamp: kind > 0.97 ? (undefined as unknown as number) : t, accuracy: 5 });
  }
  return out;
}

describe('the web copy of the distance rule agrees with geometry.ts', () => {
  it('judges every step of many messy trails the same way', () => {
    let counted = 0;
    let cut = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const trail = messyTrail(seed, 120);
      for (let i = 1; i < trail.length; i++) {
        const ts = stepCountsAsDistance(trail[i - 1], trail[i]);
        expect(web.gapStepCounts(trail[i - 1], trail[i])).toBe(ts);
        if (ts) counted++;
        else cut++;
      }
    }
    // the sample really exercises both outcomes
    expect(counted).toBeGreaterThan(500);
    expect(cut).toBeGreaterThan(500);
  });

  it('splits into the same runs', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const trail = messyTrail(seed, 120);
      expect(web.gapSplit(trail)).toEqual(splitAtGaps(trail));
    }
    expect(web.gapSplit([])).toEqual([]);
  });

  it('is embedded in the live map and the portrait pages, which parse', () => {
    for (const html of [mapHTML, portraitHTML]) {
      expect(html).toContain('function gapSplit');
      expect(html).toContain('GAP_BRIDGE_MAX_M = 250');
    }
    expect(mapHTML).toContain('gapSplit(locations)');
  });
});
