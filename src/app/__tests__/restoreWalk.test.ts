import { decideWalkRestore, mergeNewerFixes, RESTORE_MAX_AGE_MS, replayAutoFinish } from '../restoreWalk';
import { AUTO_FINISH_MIN_WALK_MS, HOME_DWELL_MS, STILL_MS } from '../autoFinish';
import type { Location, Walk } from '../../types';

const MIN = 60_000;
const T0 = 1_800_000_000_000;
const NORTH_M = 1 / 111320;
/** A fix `metres` north of the start, `ms` after the walk began. */
const fixAt = (metres: number, ms: number): Location => ({ latitude: 52 + metres * NORTH_M, longitude: 13, timestamp: T0 + ms, accuracy: 5 });
const walkOf = (locations: Location[]): Walk => ({ id: 'w1', startTime: T0, locations, closed: false, startSource: 'button' });

/** A walk that keeps moving, one fix per 10 s, 5 m apart, for `minutes`. */
function movingWalk(minutes: number): Walk {
  const fixes: Location[] = [];
  for (let s = 0; s <= minutes * 60; s += 10) fixes.push(fixAt((s / 10) * 5, s * 1000));
  return walkOf(fixes);
}

/** Fixes every 4 minutes at `metres` north (plus 3 m jitter), from `fromMin` to `toMin`: the phone is delivering, and standing still. */
const standingFixes = (metres: number, fromMin: number, toMin: number): Location[] => {
  const out: Location[] = [];
  for (let m = fromMin; m <= toMin; m += 4) out.push(fixAt(metres + (m % 8 === 0 ? 3 : 0), m * MIN));
  return out;
};

describe('decideWalkRestore', () => {
  it('resumes a fresh walk, with the auto-finish state rebuilt from the stored fixes', () => {
    const walk = movingWalk(10);
    const decision = decideWalkRestore(walk, T0 + 10 * MIN + 30_000, true);
    expect(decision.kind).toBe('resume');
    if (decision.kind === 'resume') {
      expect(decision.autoFinish.startedAt).toBe(T0);
      expect(decision.autoFinish.enabled).toBe(true);
    }
  });

  it('resumes a one-point walk that is still fresh', () => {
    expect(decideWalkRestore(walkOf([fixAt(0, 0)]), T0 + MIN, true).kind).toBe('resume');
  });

  it('finishes a stale walk (newest fix 3 h old or older) as it stands', () => {
    const walk = movingWalk(10);
    const lastFixAt = walk.locations[walk.locations.length - 1].timestamp;
    expect(decideWalkRestore(walk, lastFixAt + RESTORE_MAX_AGE_MS - 1, false).kind).toBe('resume');
    expect(decideWalkRestore(walk, lastFixAt + RESTORE_MAX_AGE_MS, false)).toEqual({ kind: 'finish', endedBy: 'auto-still', reason: 'stale' });
  });

  it('discards a tiny stale walk quietly', () => {
    expect(decideWalkRestore(walkOf([fixAt(0, 0)]), T0 + RESTORE_MAX_AGE_MS + MIN, true)).toEqual({ kind: 'discard' });
  });

  it('finishes when the auto-finish rules say it is done: back home after the dwell', () => {
    // Out to 200 m, then back at the start for the whole dwell.
    // Walked there and back in 5 m steps, so the walk has real distance.
    const out = Array.from({ length: 41 }, (_, i) => fixAt(i * 5, i * 10_000));
    const back = Array.from({ length: 41 }, (_, i) => fixAt(200 - i * 5, 4 * MIN + i * 10_000));
    const fixes = [...out, ...back, fixAt(1, 12 * MIN + HOME_DWELL_MS + 10_000)];
    const decision = decideWalkRestore(walkOf(fixes), T0 + 12 * MIN + HOME_DWELL_MS + 20_000, true);
    expect(decision).toEqual({ kind: 'finish', endedBy: 'auto-home', reason: 'home' });
  });

  it('discards, instead of finishing, a stale walk that never moved', () => {
    const fixes = [fixAt(0, 0), fixAt(5, MIN), fixAt(8, 2 * MIN)];
    expect(decideWalkRestore(walkOf(fixes), T0 + RESTORE_MAX_AGE_MS + 5 * MIN, true)).toEqual({ kind: 'discard' });
  });

  it('discards a walk the still rule would end (fixes kept arriving, standing still) when it never moved', () => {
    const fixes = standingFixes(5, 0, 24);
    expect(decideWalkRestore(walkOf(fixes), T0 + 25 * MIN, true)).toEqual({ kind: 'discard' });
  });

  it('still resumes a fresh walk with no movement yet (the player may just have started)', () => {
    expect(decideWalkRestore(walkOf([fixAt(0, 0), fixAt(5, MIN)]), T0 + 2 * MIN, true).kind).toBe('resume');
  });

  it('finishes when the dog stood still for the still limit (fixes arrived the whole time)', () => {
    const fixes = [fixAt(0, 0), fixAt(100, 2 * MIN), ...standingFixes(100, 6, 26)];
    const decision = decideWalkRestore(walkOf(fixes), T0 + 27 * MIN, true);
    expect(decision).toEqual({ kind: 'finish', endedBy: 'auto-still', reason: 'still' });
  });

  it('never auto-finishes a fresh walk when auto-finish is switched off', () => {
    const fixes = [fixAt(0, 0), fixAt(100, 2 * MIN), ...standingFixes(100, 6, 26)];
    expect(decideWalkRestore(walkOf(fixes), T0 + 27 * MIN, false).kind).toBe('resume');
  });

  describe('a GPS gap (the fixes simply stopped) is resumed, never ended or discarded', () => {
    it('a fresh walk that moved, silent for 40 minutes', () => {
      const walk = movingWalk(10);
      const lastFixAt = walk.locations[walk.locations.length - 1].timestamp;
      expect(decideWalkRestore(walk, lastFixAt + 40 * MIN, true).kind).toBe('resume');
    });

    it('a fresh walk that never moved and went silent (the old rule discarded it)', () => {
      const walk = walkOf([fixAt(0, 0), fixAt(5, MIN)]);
      expect(decideWalkRestore(walk, T0 + 2 * 60 * MIN, true).kind).toBe('resume');
    });

    it('a start-only walk, an hour later', () => {
      expect(decideWalkRestore(walkOf([fixAt(0, 0)]), T0 + 60 * MIN, true).kind).toBe('resume');
    });

    it('the resumed state carries the gap (lastFixAt is the newest stored fix, not "now")', () => {
      const walk = movingWalk(10);
      const lastFixAt = walk.locations[walk.locations.length - 1].timestamp;
      const decision = decideWalkRestore(walk, lastFixAt + 40 * MIN, true);
      expect(decision.kind === 'resume' && decision.autoFinish.lastFixAt).toBe(lastFixAt);
    });
  });

  it('does not end a short walk early (under the minimum walk length)', () => {
    const fixes = [fixAt(0, 0), fixAt(200, MIN)];
    expect(AUTO_FINISH_MIN_WALK_MS).toBeGreaterThan(5 * MIN);
    expect(decideWalkRestore(walkOf(fixes), T0 + 5 * MIN, true).kind).toBe('resume');
  });
});

describe('production case 2026-10-19: GPS died after 4 minutes, the player tapped the notification later', () => {
  /** 84 fixes, one per 3 s for 4 minutes: out 200 m and back to 10 m from the start. */
  const fourMinuteWalk = (): Walk => {
    const fixes: Location[] = [];
    for (let i = 0; i < 84; i++) {
      const progress = i / 83;
      fixes.push(fixAt(progress < 0.5 ? progress * 2 * 200 : 10 + (1 - progress) * 2 * 190, i * 3_000));
    }
    return walkOf(fixes);
  };

  it('resumes (map shown, no finish) when the app is opened 10+ minutes after the last fix, whether the last fix was at home or away', () => {
    const walk = fourMinuteWalk();
    const lastFixAt = walk.locations[walk.locations.length - 1].timestamp;
    for (const gapMin of [10, 16, 30, 90]) {
      expect(decideWalkRestore(walk, lastFixAt + gapMin * MIN, true).kind).toBe('resume');
    }
    const awayWalk = walkOf(walk.locations.slice(0, 40)); // last fix still 100+ m out, anchor moving: same story
    expect(decideWalkRestore(awayWalk, T0 + 40 * 3_000 + 25 * MIN, true).kind).toBe('resume');
  });
});

describe('replayAutoFinish', () => {
  it('knows the walk went far away (home countdown needs it) after a restore', () => {
    const { state } = replayAutoFinish(walkOf([fixAt(0, 0), fixAt(300, 5 * MIN)]), true, T0 + 6 * MIN);
    expect(state.awayReached).toBe(true);
  });
});

describe('mergeNewerFixes', () => {
  it('appends only fixes newer than the walk\'s newest one', () => {
    const walk = walkOf([fixAt(0, 0), fixAt(5, 1000)]);
    const merged = mergeNewerFixes(walk, [fixAt(0, 0), fixAt(5, 1000), fixAt(10, 2000), fixAt(15, 3000)]);
    expect(merged.locations.map((l) => l.timestamp)).toEqual([T0, T0 + 1000, T0 + 2000, T0 + 3000]);
  });

  it('fills the gap when the live watcher already appended a newer fix (stored copy has the fixes in between)', () => {
    // Restored with fixes up to +1000; the watcher delivered +4000 before the stored copy was merged.
    const walk = walkOf([fixAt(0, 0), fixAt(5, 1000), fixAt(20, 4000)]);
    const stored = [fixAt(0, 0), fixAt(5, 1000), fixAt(10, 2000), fixAt(15, 3000), fixAt(20, 4000)];
    const merged = mergeNewerFixes(walk, stored, T0 + 1000);
    expect(merged.locations.map((l) => l.timestamp)).toEqual([T0, T0 + 1000, T0 + 2000, T0 + 3000, T0 + 4000]);
  });

  it('returns the same walk when nothing is newer', () => {
    const walk = walkOf([fixAt(0, 0)]);
    expect(mergeNewerFixes(walk, [fixAt(0, 0)])).toBe(walk);
  });
});
