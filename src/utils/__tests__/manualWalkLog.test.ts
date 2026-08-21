import { isWithinManualLogWindow, startTimeForMissedWalk } from '../manualWalkLog';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
