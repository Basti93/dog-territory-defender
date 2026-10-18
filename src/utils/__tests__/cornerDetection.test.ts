import { CORNER_CONFIG } from '../../economy/corners';
import type { Location } from '../../types';
import { CornerWalk, cornersTouchedBy, detectCorners, homeAnchor, parseCornerId, resolveCorners } from '../cornerDetection';
import { getDistance } from '../geometry';
import { cellCentre, cellKey } from '../grid';

const HOME_LAT = 52.5;
const HOME_LON = 13.4;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((HOME_LAT * Math.PI) / 180);
const DAY = 24 * 3600 * 1000;
const T0 = new Date(2026, 8, 1, 10, 0, 0).getTime();

/** A straight walk east along one street, a fix every 10 m at 2 m/s. `fromM`/`toM` are metres east of home, `northM` the street's offset. */
function street(fromM: number, toM: number, northM: number, startTime: number): Location[] {
  const out: Location[] = [];
  const dir = toM >= fromM ? 1 : -1;
  for (let i = 0, x = fromM; dir * (toM - x) >= 0; i++, x = fromM + dir * 10 * i) {
    out.push({ latitude: HOME_LAT + northM / M_PER_DEG_LAT, longitude: HOME_LON + x / M_PER_DEG_LON, timestamp: startTime + i * 5000, accuracy: 5 });
  }
  return out;
}

let n = 0;
function walk(day: number, locations: Location[], extra: Partial<CornerWalk> = {}): CornerWalk {
  n += 1;
  return { id: `w${n}`, startTime: T0 + day * DAY, startSource: 'button', locations, ...extra };
}

/** The same street (from 300 m to 500 m east of home, away from the home block) on the given days. */
const farStreetWalks = (days: number[]) => days.map((d) => walk(d, street(300, 500, 0, T0 + d * DAY)));

describe('detectCorners', () => {
  it('makes a corner when tracked walks passed on 4 different days, on the walk that completes the fourth', () => {
    const walks = farStreetWalks([0, 1, 2, 3]);
    const corners = detectCorners(walks);
    expect(corners).toHaveLength(1);
    expect(corners[0].walkId).toBe(walks[3].id);
    expect(corners[0].createdAt).toBe(walks[3].startTime);
    expect(corners[0].id).toBe(cellKey(corners[0].ix, corners[0].iy));
    // It sits on the street, between 300 m and 500 m east of home.
    const [lat, lon] = cellCentre(corners[0].ix, corners[0].iy);
    const eastM = (lon - HOME_LON) * M_PER_DEG_LON;
    expect(eastM).toBeGreaterThan(280);
    expect(eastM).toBeLessThan(520);
    expect(Math.abs((lat - HOME_LAT) * M_PER_DEG_LAT)).toBeLessThan(40);
  });

  it('needs four days: three days make no corner', () => {
    expect(detectCorners(farStreetWalks([0, 1, 2]))).toEqual([]);
  });

  it('counts days per walk, not paints: several walks on one day count once', () => {
    expect(detectCorners(farStreetWalks([0, 0, 0, 1, 2]))).toEqual([]);
    expect(detectCorners(farStreetWalks([0, 0, 1, 2, 3]))).toHaveLength(1);
  });

  it('counts a walk that passes the same spot twice once (out and back)', () => {
    const outAndBack = (day: number) => walk(day, [...street(300, 500, 0, T0 + day * DAY), ...street(500, 300, 0, T0 + day * DAY + 3600_000)]);
    expect(detectCorners([0, 1, 2].map(outAndBack))).toEqual([]);
    expect(detectCorners([0, 1, 2, 3].map(outAndBack))).toHaveLength(1);
  });

  it('does not count a street 100 m away from the block', () => {
    const walks = [0, 1, 2].map((d) => walk(d, street(300, 500, 0, T0 + d * DAY)));
    walks.push(walk(3, street(300, 500, 100, T0 + 3 * DAY)));
    expect(detectCorners(walks)).toEqual([]);
  });

  it('ignores manual logs and one-fix walks', () => {
    const walks = [...farStreetWalks([0, 1, 2]), walk(3, street(300, 500, 0, T0 + 3 * DAY), { startSource: 'manual-log' }), walk(4, street(300, 300, 0, T0 + 4 * DAY))];
    expect(detectCorners(walks)).toEqual([]);
  });

  it('keeps the home block free: no corner within 150 m of home', () => {
    // Every walk starts at home and runs 250 m east: the walked ground is home (anchor) .. 250 m.
    const walks = [0, 1, 2, 3, 4].map((d) => walk(d, street(0, 250, 0, T0 + d * DAY)));
    const home = homeAnchor(walks)!;
    const corners = detectCorners(walks);
    expect(corners.length).toBeGreaterThan(0);
    for (const c of corners) {
      const [lat, lon] = cellCentre(c.ix, c.iy);
      expect(getDistance(lat, lon, home.lat, home.lon)).toBeGreaterThanOrEqual(CORNER_CONFIG.homeExcludeM);
    }
    // Walks that only ever stay in the home block make nothing.
    expect(detectCorners([0, 1, 2, 3, 4].map((d) => walk(d, street(0, 100, 0, T0 + d * DAY))))).toEqual([]);
  });

  it('keeps corners at least 200 m apart', () => {
    // A long street walked every day: later corners come a week apart and only 200+ m from every earlier one.
    const walks = Array.from({ length: 25 }, (_, d) => walk(d, street(250, 1200, 0, T0 + d * DAY)));
    const corners = detectCorners(walks);
    expect(corners.length).toBeGreaterThan(1);
    for (const a of corners) {
      for (const b of corners) {
        if (a === b) continue;
        const [la, oa] = cellCentre(a.ix, a.iy);
        const [lb, ob] = cellCentre(b.ix, b.iy);
        expect(getDistance(la, oa, lb, ob)).toBeGreaterThanOrEqual(CORNER_CONFIG.minSpacingM);
      }
    }
  });

  // Two streets 600 m apart, both walked on every given day, in one walk.
  const bothStreets = (d: number) => walk(d, [...street(300, 500, 0, T0 + d * DAY), ...street(500, 300, 600, T0 + d * DAY + 3600_000)]);

  it('makes at most one new corner per walk, and at most one per 7 local days', () => {
    // Day 3 completes both streets, but only one corner appears.
    expect(detectCorners([0, 1, 2, 3].map(bothStreets))).toHaveLength(1);
    // The other street waits: not on day 9 (6 days later), but on day 10 (7 days later). Each walk made at most one.
    const upToNine = detectCorners(Array.from({ length: 10 }, (_, d) => bothStreets(d)));
    expect(upToNine).toHaveLength(1);
    const upToTen = detectCorners(Array.from({ length: 11 }, (_, d) => bothStreets(d)));
    expect(upToTen).toHaveLength(2);
    expect(new Set(upToTen.map((c) => c.walkId)).size).toBe(2);
    expect(upToTen[1].createdAt - upToTen[0].createdAt).toBe(7 * DAY);
  });

  it('judges the pacing by the walk dates, not by when detection runs', () => {
    // Four walks a year ago and four walks the day after: the dates decide, whatever today is.
    const old = (d: number) => walk(-400 + d, street(300, 500, 0, T0 + (-400 + d) * DAY));
    const corners = detectCorners([0, 1, 2, 3].map(old));
    expect(corners).toHaveLength(1);
    expect(corners[0].createdAt).toBe(T0 - 397 * DAY);
  });

  it('gives the same ids whatever order the walks arrive in (both phones agree)', () => {
    const walks = Array.from({ length: 14 }, (_, d) => bothStreets(d));
    const forward = detectCorners(walks).map((c) => c.id);
    const shuffled = [...walks].sort((a, b) => ((a.id.charCodeAt(1) * 7919) % 13) - ((b.id.charCodeAt(1) * 7919) % 13) || (a.id < b.id ? 1 : -1));
    expect(detectCorners(shuffled).map((c) => c.id)).toEqual(forward);
    expect(forward).toHaveLength(2);
  });

  it('returns only what is new when the known corners are given, and never breaks the pacing on a rerun', () => {
    const walks = Array.from({ length: 14 }, (_, d) => bothStreets(d));
    const all = detectCorners(walks);
    expect(all).toHaveLength(2);
    expect(detectCorners(walks, all)).toEqual([]);
    expect(detectCorners(walks, [all[0]]).map((c) => c.id)).toEqual([all[1].id]);
    // The corner of the first walks is known; a later walk adds exactly what it completes, at most one.
    const sofar = detectCorners(walks.slice(0, 4));
    expect(sofar).toHaveLength(1);
    expect(detectCorners(walks.slice(0, 10), sofar)).toEqual([]); // day 9: still resting
    const next = detectCorners(walks.slice(0, 11), sofar);
    expect(next).toHaveLength(1);
    expect(next[0].walkId).toBe(walks[10].id);
  });

  it('does not make a second id for a street that already has a known corner', () => {
    const walks = [0, 1, 2, 3].map((d) => walk(d, street(300, 500, 0, T0 + d * DAY)));
    const [mine] = detectCorners(walks);
    // The other phone's corner for the same street sits two cells (about 40 m) away: not new here.
    expect(detectCorners(walks, [{ ix: mine.ix + 2, iy: mine.iy }])).toEqual([]);
  });

  it('a corner stored under the old rule (150 m spacing) is never in the way of its own replay result', () => {
    // detectCorners only ever adds: whatever is stored stays, and stored corners 170 m apart both still count as known.
    const walks = Array.from({ length: 25 }, (_, d) => walk(d, street(250, 1200, 0, T0 + d * DAY)));
    const all = detectCorners(walks);
    const oldStyle = [{ ix: all[0].ix, iy: all[0].iy }, { ix: all[0].ix + 9, iy: all[0].iy }]; // about 170 m east
    const added = detectCorners(walks, oldStyle);
    for (const c of added) expect(oldStyle.some((o) => o.ix === c.ix && o.iy === c.iy)).toBe(false);
  });

  it('stays quick over a long history (300 walks of a 2 km loop)', () => {
    const loop = (d: number) => walk(d, [...street(250, 1250, 0, T0 + d * DAY), ...street(1250, 250, 150, T0 + d * DAY + 3600_000)]);
    const walks = Array.from({ length: 300 }, (_, d) => loop(d));
    const started = Date.now();
    const corners = detectCorners(walks);
    expect(corners.length).toBeGreaterThan(2);
    expect(Date.now() - started).toBeLessThan(8000);
  });
});

describe('resolveCorners', () => {
  const cell = (eastM: number) => {
    // The cell id for a point eastM east of home.
    const iy = Math.floor(HOME_LAT / (20 / M_PER_DEG_LAT));
    const dLon = 20 / (M_PER_DEG_LAT * Math.cos((iy + 0.5) * (20 / M_PER_DEG_LAT) * (Math.PI / 180)));
    const ix = Math.floor((HOME_LON + eastM / M_PER_DEG_LON) / dLon);
    return { ix, iy, id: cellKey(ix, iy) };
  };
  const corner = (eastM: number, createdAt: number, name: string | null) => ({ ...cell(eastM), createdAt, name });

  it('shows one corner where two phones hold different ids for one street: named first, then older, then lower id', () => {
    const unnamed = corner(300, 1, null);
    const named = corner(380, 2, 'Kiosk-Ecke');
    expect(resolveCorners([unnamed, named])).toEqual([named]);
    const older = corner(300, 1, null);
    const newer = corner(380, 2, null);
    expect(resolveCorners([newer, older])).toEqual([older]);
  });

  it('never folds two corners that are 150 m or more apart, so a corner stored under the old 150 m rule stays visible', () => {
    const a = corner(300, 1, 'Kiosk-Ecke');
    const b = corner(300 + 160, 2, 'Bank');
    expect(resolveCorners([a, b])).toHaveLength(2);
  });

  it('keeps corners that are far enough apart', () => {
    const a = corner(300, 1, null);
    const b = corner(600, 2, null);
    expect(resolveCorners([a, b])).toHaveLength(2);
  });
});

describe('cornersTouchedBy', () => {
  it('lists the corners whose block the path runs through, the most-walked first', () => {
    const walks = [walk(0, street(300, 700, 0, T0))];
    const iy = Math.floor(HOME_LAT / (20 / M_PER_DEG_LAT));
    const dLon = 20 / (M_PER_DEG_LAT * Math.cos((iy + 0.5) * (20 / M_PER_DEG_LAT) * (Math.PI / 180)));
    const ixAt = (eastM: number) => Math.floor((HOME_LON + eastM / M_PER_DEG_LON) / dLon);
    const near = { id: cellKey(ixAt(400), iy), ix: ixAt(400), iy };
    const far = { id: cellKey(ixAt(5000), iy), ix: ixAt(5000), iy };
    expect(cornersTouchedBy(walks[0], [far, near])).toEqual([near.id]);
    expect(cornersTouchedBy({ locations: [] }, [near])).toEqual([]);
  });
});

describe('parseCornerId', () => {
  it('reads "ix,iy" and nothing else', () => {
    expect(parseCornerId('12,-34')).toEqual({ ix: 12, iy: -34 });
    expect(parseCornerId('nope')).toBeNull();
    expect(parseCornerId('1,2,3')).toBeNull();
  });
});
