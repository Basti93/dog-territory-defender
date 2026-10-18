import { StoredWalk } from '../../storage/WalkRepository';
import {
  dayAndTimeOfDayPhrase,
  eligibleRefreshRoutes,
  isWithinManualLogWindow,
  startTimeForMissedWalk,
} from '../manualWalkLog';
import { setLocale } from '../../i18n';

// These tests assert English copy; pin the locale explicitly.
beforeAll(() => setLocale('en'));

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function makeStoredWalk(overrides: Partial<StoredWalk> = {}): StoredWalk {
  return {
    id: 'walk-1',
    startTime: 1000,
    closed: true,
    startSource: 'button',
    locations: [{ latitude: 52.5, longitude: 13.4, timestamp: 1000, accuracy: 5 }],
    syncedAt: null,
    ...overrides,
  };
}

// A fixed mid-afternoon local time, well clear of midnight boundaries.
const NOW = new Date(2026, 0, 15, 15, 0, 0).getTime(); // Jan 15 2026, 15:00 local

describe('startTimeForMissedWalk', () => {
  it("returns 'now' for the today option", () => {
    expect(startTimeForMissedWalk('today', NOW)).toBe(NOW);
  });

  it("returns 24h earlier for the yesterday option", () => {
    expect(startTimeForMissedWalk('yesterday', NOW)).toBe(NOW - ONE_DAY_MS);
  });
});

describe('isWithinManualLogWindow', () => {
  it('accepts a startTime earlier today', () => {
    expect(isWithinManualLogWindow(NOW - 60 * 60 * 1000, NOW)).toBe(true);
  });

  it('accepts a startTime from yesterday', () => {
    expect(isWithinManualLogWindow(NOW - ONE_DAY_MS, NOW)).toBe(true);
  });

  it('rejects a startTime from two days ago', () => {
    expect(isWithinManualLogWindow(NOW - 2 * ONE_DAY_MS, NOW)).toBe(false);
  });

  it('rejects a startTime a week ago', () => {
    expect(isWithinManualLogWindow(NOW - 7 * ONE_DAY_MS, NOW)).toBe(false);
  });

  it('accepts a startTime late yesterday evening, even close to the calendar boundary', () => {
    const lateLastNight = new Date(2026, 0, 14, 23, 45, 0).getTime(); // Jan 14 2026, 23:45 local
    expect(isWithinManualLogWindow(lateLastNight, NOW)).toBe(true);
  });

  it('rejects a startTime from the day before yesterday, even if less than 48h ago', () => {
    // Jan 13 2026 23:50 — under 48h before NOW (Jan 15 15:00), but calendar-wise two days back.
    const dayBeforeYesterdayLate = new Date(2026, 0, 13, 23, 50, 0).getTime();
    expect(isWithinManualLogWindow(dayBeforeYesterdayLate, NOW)).toBe(false);
  });

  it('accepts a startTime that is exactly now', () => {
    expect(isWithinManualLogWindow(NOW, NOW)).toBe(true);
  });
});

describe('dayAndTimeOfDayPhrase (docs/decisions/walk-portrait.md Decision 7)', () => {
  it('formats the weekday and day-of-week correctly', () => {
    const tuesdayMorning = new Date(2026, 0, 13, 9, 0, 0).getTime(); // Jan 13 2026 is a Tuesday
    expect(dayAndTimeOfDayPhrase(tuesdayMorning)).toBe('Tuesday morning');
  });

  it('buckets late night (before 5am) as "night"', () => {
    const lateNight = new Date(2026, 0, 15, 3, 0, 0).getTime();
    expect(dayAndTimeOfDayPhrase(lateNight)).toBe('Thursday night');
  });

  it('buckets 5am-11:59am as "morning"', () => {
    const morning = new Date(2026, 0, 15, 5, 0, 0).getTime();
    expect(dayAndTimeOfDayPhrase(morning)).toBe('Thursday morning');
    const lateMorning = new Date(2026, 0, 15, 11, 59, 0).getTime();
    expect(dayAndTimeOfDayPhrase(lateMorning)).toBe('Thursday morning');
  });

  it('buckets noon-4:59pm as "afternoon"', () => {
    const noon = new Date(2026, 0, 15, 12, 0, 0).getTime();
    expect(dayAndTimeOfDayPhrase(noon)).toBe('Thursday afternoon');
    const lateAfternoon = new Date(2026, 0, 15, 16, 59, 0).getTime();
    expect(dayAndTimeOfDayPhrase(lateAfternoon)).toBe('Thursday afternoon');
  });

  it('buckets 5pm-8:59pm as "evening"', () => {
    const evening = new Date(2026, 0, 15, 17, 0, 0).getTime();
    expect(dayAndTimeOfDayPhrase(evening)).toBe('Thursday evening');
    const lateEvening = new Date(2026, 0, 15, 20, 59, 0).getTime();
    expect(dayAndTimeOfDayPhrase(lateEvening)).toBe('Thursday evening');
  });

  it('buckets 9pm and later back to "night"', () => {
    const night = new Date(2026, 0, 15, 21, 0, 0).getTime();
    expect(dayAndTimeOfDayPhrase(night)).toBe('Thursday night');
  });
});

// docs/decisions/2026-08-21-home-range.md Decision 4, rule 1: a manual-log
// route refresh may only pick "the cell set of a previously-completed
// tracked walk" — never a manual log itself (no GPS evidence to refresh
// from) and never an empty-trail walk.
describe('eligibleRefreshRoutes', () => {
  it('includes a previously-tracked walk with a real GPS trail', () => {
    const tracked = makeStoredWalk({ id: 'tracked', startSource: 'button' });
    expect(eligibleRefreshRoutes([tracked])).toEqual([tracked]);
  });

  it('excludes manual-log walks, even a "closed" one', () => {
    const manual = makeStoredWalk({ id: 'manual', startSource: 'manual-log', locations: [] });
    expect(eligibleRefreshRoutes([manual])).toEqual([]);
  });

  it('excludes a tracked walk with no locations (defensive — should not exist in practice, but never eligible if it does)', () => {
    const emptyTracked = makeStoredWalk({ id: 'empty-tracked', startSource: 'button', locations: [] });
    expect(eligibleRefreshRoutes([emptyTracked])).toEqual([]);
  });

  it('sorts most-recent-first', () => {
    const older = makeStoredWalk({ id: 'older', startTime: 1000 });
    const newer = makeStoredWalk({ id: 'newer', startTime: 5000 });
    expect(eligibleRefreshRoutes([older, newer]).map((w) => w.id)).toEqual(['newer', 'older']);
  });
});
