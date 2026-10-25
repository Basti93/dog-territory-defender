import { eastwardTrail, manualWalk, stillWalk, trackedWalk } from '../../test/postcardFixtures';
import type { StoredWalk } from '../../storage/WalkRepository';
import { setLocale } from '../../i18n';
import {
  bucketForHour,
  buildWalkDiary,
  diaryAnnouncements,
  normalizeDiarySeen,
  roundedMeters,
  roundedMinutes,
  median,
} from '../walkDiary';
import { bucketComparisonLine, friendlyDistance, friendlyDuration, sniffComment, typicalLine } from '../walkDiaryCopy';

/** A tracked walk of `minutes` (fixes 2 s apart, ~2.7 m per step) starting at local `hour` on Oct `day` 2026. */
function walk(id: string, day: number, hour: number, minutes: number, stepDeg = 0.00004): StoredWalk {
  const startTime = new Date(2026, 9, day, hour, 0).getTime();
  return trackedWalk(id, { startTime, locations: eastwardTrail(startTime, minutes * 30 + 1, stepDeg) });
}

describe('bucketForHour', () => {
  it('uses local hours: Morgen <11, Mittag 11-17, Abend 17-22, Nacht >=22 or <5', () => {
    expect([0, 4, 5, 10, 11, 16, 17, 21, 22, 23].map(bucketForHour)).toEqual([
      'night', 'night', 'morning', 'morning', 'midday', 'midday', 'evening', 'evening', 'night', 'night',
    ]);
  });
});

describe('median', () => {
  it('is the middle value, the mean of the two middle ones for an even count', () => {
    expect(median([5])).toBe(5);
    expect(median([30, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('buildWalkDiary', () => {
  it('is empty and not ready without walks', () => {
    const d = buildWalkDiary([]);
    expect(d).toMatchObject({ walkCount: 0, ready: false, walksToGo: 3, typical: null, longest: null, last: null, totalMeters: 0, buckets: [], topBucket: null, evenBuckets: false });
  });

  it('counts down the teaser and turns ready at the third walk', () => {
    const two = buildWalkDiary([walk('a', 1, 9, 20), walk('b', 2, 9, 30)]);
    expect(two).toMatchObject({ ready: false, walksToGo: 1, walkCount: 2 });
    const three = buildWalkDiary([walk('a', 1, 9, 20), walk('b', 2, 9, 30), walk('c', 3, 9, 40)]);
    expect(three).toMatchObject({ ready: true, walksToGo: 0 });
    expect(three.typical?.durationMs).toBe(30 * 60000);
    expect(three.longest).toEqual({ durationMs: 40 * 60000, startTime: new Date(2026, 9, 3, 9).getTime() });
    expect(three.last?.startTime).toBe(new Date(2026, 9, 3, 9).getTime());
    expect(three.totalMeters).toBeGreaterThan(0);
    expect(three.typical!.distanceMeters).toBeGreaterThan(0); // the median distance, not the mean
    expect(three.typical!.distanceMeters).toBeLessThan(three.totalMeters / 2);
  });

  it('leaves out manual logs, walks that went nowhere and walks without a usable span', () => {
    const d = buildWalkDiary([manualWalk('m'), stillWalk('s'), walk('a', 1, 9, 20)]);
    expect(d.walkCount).toBe(1);
  });

  it('is robust: one stuck walk, one aborted walk and one glitch cannot move the typical walk, the longest or the buckets', () => {
    const t0 = new Date(2026, 9, 1, 9, 0).getTime();
    const idleTail = (id: string, day: number) => {
      const start = new Date(2026, 9, day, 9, 0).getTime();
      const moving = eastwardTrail(start, 20 * 30 + 1); // 20 real minutes, then 3 hours of a phone on a bench
      const last = moving[moving.length - 1];
      const bench = Array.from({ length: 36 * 60 }, (_, i) => ({ latitude: last.latitude + Math.sin(i) * 0.00002, longitude: last.longitude + Math.cos(i) * 0.00002, timestamp: last.timestamp + (i + 1) * 5000, accuracy: 10 }));
      return trackedWalk(id, { startTime: start, locations: [...moving, ...bench] });
    };
    const good = [walk('a', 1, 9, 20), walk('b', 2, 9, 30), walk('c', 3, 9, 40)];
    const clean = buildWalkDiary(good);
    const tail = buildWalkDiary([...good, idleTail('stuck', 4)]);
    expect(tail.walkCount).toBe(4); // its real 20 minutes still count, the bench does not
    expect(tail.longest!.durationMs).toBe(40 * 60000);
    expect(tail.typical!.durationMs).toBe(25 * 60000); // median of 20,20,30,40; the bench would have made it 30 (or the mean 70)
    const broken = buildWalkDiary([
      ...good,
      walk('tiny', 5, 9, 1), // aborted: a minute
      trackedWalk('glitch', { startTime: t0, locations: eastwardTrail(t0, 200, 0.0007) }), // jumps only
      trackedWalk('stuck-flag', { startTime: t0 + 86400000, locations: eastwardTrail(t0 + 86400000, 5 * 60 * 30 + 1, 0.00004), statsVersion: 1, statsEndTime: t0 + 86400000 + 5 * 3600_000, statsDistanceM: 2000, statsExcluded: 'stuck' }),
    ]);
    expect(broken.walkCount).toBe(3);
    expect(broken.typical).toEqual(clean.typical);
    expect(broken.longest).toEqual(clean.longest);
    expect(broken.totalMeters).toBeCloseTo(clean.totalMeters, 6);
  });

  it('uses the median, so one long outlier among the good walks does not drag the typical walk or a time-of-day row', () => {
    const d = buildWalkDiary([walk('a', 1, 9, 20), walk('b', 2, 9, 20), walk('c', 3, 9, 22), walk('x', 4, 9, 150)]);
    expect(d.typical!.durationMs).toBe(21 * 60000);
    expect(d.buckets[0].avgDurationMs).toBe(21 * 60000);
  });

  it('shows only buckets with at least 3 walks, in day order', () => {
    const walks = [
      walk('e1', 1, 18, 40), walk('e2', 2, 18, 40), walk('e3', 3, 19, 40),
      walk('m1', 4, 7, 20), walk('m2', 5, 8, 20), walk('m3', 6, 9, 20),
      walk('n1', 7, 23, 10), walk('n2', 8, 2, 10), // only 2 night walks
      walk('d1', 9, 12, 30),
    ];
    const d = buildWalkDiary(walks);
    expect(d.buckets.map((b) => [b.bucket, b.count])).toEqual([['morning', 3], ['evening', 3]]);
    expect(d.buckets[1].avgDurationMs).toBe(40 * 60000);
    expect(d.topBucket).toBe('evening');
    expect(d.evenBuckets).toBe(false);
  });

  it('puts walks started at 22:00 or before 05:00 into the night bucket (needs 3)', () => {
    const d = buildWalkDiary([walk('a', 1, 22, 10), walk('b', 2, 4, 10), walk('c', 3, 23, 10)]);
    expect(d.buckets.map((b) => b.bucket)).toEqual(['night']);
    expect(d.topBucket).toBeNull();
    expect(d.evenBuckets).toBe(false); // one row: nothing to compare
  });

  it('calls it even when the averages are within 10%', () => {
    const walks = [
      walk('m1', 1, 8, 30), walk('m2', 2, 8, 30), walk('m3', 3, 8, 30),
      walk('e1', 4, 18, 32), walk('e2', 5, 18, 32), walk('e3', 6, 18, 32),
    ];
    const d = buildWalkDiary(walks);
    expect(d.evenBuckets).toBe(true);
    expect(d.topBucket).toBeNull();
  });

  it('is not even just past 10%', () => {
    const walks = [
      walk('m1', 1, 8, 30), walk('m2', 2, 8, 30), walk('m3', 3, 8, 30),
      walk('e1', 4, 18, 34), walk('e2', 5, 18, 34), walk('e3', 6, 18, 34),
    ];
    expect(buildWalkDiary(walks).topBucket).toBe('evening');
  });

  it('buckets by local start hour', () => {
    const early = new Date(2026, 9, 1, 10, 59).getTime();
    const late = new Date(2026, 9, 1, 11, 0).getTime();
    const d = buildWalkDiary([1, 2, 3].map((i) => trackedWalk(`a${i}`, { startTime: early + i * 86400000, locations: eastwardTrail(early + i * 86400000, 301) })).concat([trackedWalk('z', { startTime: late, locations: eastwardTrail(late, 301) })]));
    expect(d.buckets.map((b) => b.bucket)).toEqual(['morning']);
  });
});

describe('rounding', () => {
  it('rounds minutes: to the minute under 10, to 5 from there, at least 1', () => {
    expect([10_000, 4 * 60000 + 20000, 9 * 60000 + 40000, 12 * 60000, 13 * 60000, 34 * 60000 + 47000].map(roundedMinutes)).toEqual([1, 4, 10, 10, 15, 35]);
  });
  it('rounds meters: to 50 under 1 km (at least 50), to 100 above', () => {
    expect([10, 120, 980, 2040, 2060].map(roundedMeters)).toEqual([50, 100, 1000, 2000, 2100]);
  });
});

describe('diaryAnnouncements', () => {
  const ready = buildWalkDiary([walk('a', 1, 9, 20), walk('b', 2, 9, 30), walk('c', 3, 9, 40)]);
  it('says nothing before the diary is ready', () => {
    expect(diaryAnnouncements(buildWalkDiary([]), normalizeDiarySeen(null))).toEqual({ showIntro: false, newLongest: false, next: null });
  });
  it('introduces the diary once, without a record fanfare', () => {
    const first = diaryAnnouncements(ready, normalizeDiarySeen(null));
    expect(first).toEqual({ showIntro: true, newLongest: false, next: { introShown: true, longestMs: 40 * 60000 } });
    expect(diaryAnnouncements(ready, first.next!)).toEqual({ showIntro: false, newLongest: false, next: null });
  });
  it('flags a real new longest walk only', () => {
    const more = buildWalkDiary([walk('a', 1, 9, 20), walk('b', 2, 9, 30), walk('c', 3, 9, 40), walk('d', 4, 9, 50)]);
    const r = diaryAnnouncements(more, { introShown: true, longestMs: 40 * 60000 });
    expect(r.newLongest).toBe(true);
    expect(r.next).toEqual({ introShown: true, longestMs: 50 * 60000 });
    expect(diaryAnnouncements(ready, { introShown: true, longestMs: 50 * 60000 })).toMatchObject({ newLongest: false, next: null });
  });
  it('normalizes junk', () => {
    expect(normalizeDiarySeen({ introShown: 'yes', longestMs: -5 })).toEqual({ introShown: false, longestMs: 0 });
  });
});

describe('copy', () => {
  beforeEach(() => setLocale('de'));
  afterEach(() => setLocale('en'));

  it('formats friendly durations and distances', () => {
    expect(friendlyDuration(34 * 60000 + 47000)).toBe('35 Min');
    expect(friendlyDuration(75 * 60000)).toBe('1 Std 15 Min');
    expect(friendlyDuration(120 * 60000)).toBe('2 Std');
    expect(friendlyDistance(2040)).toBe('2,0 km');
    expect(friendlyDistance(620)).toBe('600 m');
    expect(friendlyDistance(150_000)).toBe('150 km');
    expect(typicalLine(35 * 60000, 2100)).toBe('ca. 35 Min · 2,1 km');
  });

  it('names the top bucket, or says every time of day is good, never a ranking', () => {
    const top = buildWalkDiary([
      walk('m1', 1, 8, 20), walk('m2', 2, 8, 20), walk('m3', 3, 8, 20),
      walk('e1', 4, 18, 40), walk('e2', 5, 18, 40), walk('e3', 6, 18, 40),
    ]);
    expect(bucketComparisonLine(top)).toBe('Abendrunden sind eure längsten! Da hab ich am meisten Zeit zum Schnüffeln.');
    const even = buildWalkDiary([walk('m1', 1, 8, 30), walk('m2', 2, 8, 30), walk('m3', 3, 8, 30), walk('e1', 4, 18, 30), walk('e2', 5, 18, 30), walk('e3', 6, 18, 30)]);
    expect(bucketComparisonLine(even)).toBe('Bei uns ist jede Tageszeit gut.');
    expect(bucketComparisonLine(buildWalkDiary([walk('a', 1, 8, 30), walk('b', 2, 8, 30), walk('c', 3, 8, 30)]))).toBeNull();
  });

  it('rotates the sniff comment with the walk count and has none before the diary is ready', () => {
    expect(sniffComment(buildWalkDiary([walk('a', 1, 9, 20)]))).toBeNull();
    const base = [walk('a', 1, 9, 30), walk('b', 2, 9, 30), walk('c', 3, 9, 30)];
    const lines = new Set<string | null>();
    for (let n = 3; n < 9; n++) {
      const more = base.concat(Array.from({ length: n - 3 }, (_, i) => walk(`x${i}`, 4 + i, 9, 30)));
      lines.add(sniffComment(buildWalkDiary(more)));
    }
    expect(lines.size).toBeGreaterThan(2);
    expect([...lines].every((l) => !!l && !/Statistik|unverified/i.test(l))).toBe(true);
  });
});
