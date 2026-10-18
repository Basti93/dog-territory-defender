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

  it('discards a walk the still rule would end when it never moved', () => {
    const fixes = [fixAt(0, 0), fixAt(5, 2 * MIN)];
    expect(decideWalkRestore(walkOf(fixes), T0 + 2 * MIN + STILL_MS + MIN, true)).toEqual({ kind: 'discard' });
  });

  it('still resumes a fresh walk with no movement yet (the player may just have started)', () => {
    expect(decideWalkRestore(walkOf([fixAt(0, 0), fixAt(5, MIN)]), T0 + 2 * MIN, true).kind).toBe('resume');
  });

  it('finishes when the dog stood still for the still limit', () => {
    const fixes = [fixAt(0, 0), fixAt(100, 2 * MIN)];
    const decision = decideWalkRestore(walkOf(fixes), T0 + 2 * MIN + STILL_MS + MIN, true);
    expect(decision).toEqual({ kind: 'finish', endedBy: 'auto-still', reason: 'still' });
  });

  it('never auto-finishes a fresh walk when auto-finish is switched off', () => {
    const fixes = [fixAt(0, 0), fixAt(100, 2 * MIN)];
    expect(decideWalkRestore(walkOf(fixes), T0 + 2 * MIN + STILL_MS + MIN, false).kind).toBe('resume');
  });

  it('does not end a short walk early (under the minimum walk length)', () => {
    const fixes = [fixAt(0, 0), fixAt(200, MIN)];
    expect(AUTO_FINISH_MIN_WALK_MS).toBeGreaterThan(5 * MIN);
    expect(decideWalkRestore(walkOf(fixes), T0 + 5 * MIN, true).kind).toBe('resume');
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
