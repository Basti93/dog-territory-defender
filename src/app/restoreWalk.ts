import type { Walk } from '../types';
import { walkHasMovement } from '../utils/geometry';
import type { ActiveWalkSnapshot } from '../storage/ActiveWalkRepository';
import { AutoFinishDecision, AutoFinishState, evaluateAutoFinish, startAutoFinish, WalkEndedBy } from './autoFinish';

/**
 * Cold-start restore of a walk that was in flight when the app went away (closed, swiped, killed, or the OS relaunched
 * it headless). Pure rules only; useWalkRestore.ts does the I/O.
 */

/** A walk whose newest fix is younger than this is resumed; older is finished as it stands. */
export const RESTORE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

export type RestoreDecision =
  | { kind: 'resume'; autoFinish: AutoFinishState }
  /** Finish through the normal path. `endedBy` is what the walk record and the homecoming say. */
  | { kind: 'finish'; endedBy: WalkEndedBy; reason: 'stale' | AutoFinishDecision }
  /** Nothing worth keeping: too little data and too old, or no movement (walkHasMovement). Dropped without a word. */
  | { kind: 'discard' };

export function walkFromSnapshot(snapshot: ActiveWalkSnapshot): Walk {
  return {
    id: snapshot.meta.id,
    startTime: snapshot.meta.startTime,
    startSource: snapshot.meta.startSource,
    locations: snapshot.locations,
    closed: false,
  };
}

/**
 * Re-runs autoFinish.ts over the stored fixes (its state is not persisted), as it would have run live, then ticks it
 * at `now`. A decision part-way means the walk would already have ended while the app was away.
 */
export function replayAutoFinish(
  walk: Walk,
  enabled: boolean,
  now: number
): { state: AutoFinishState; decision: AutoFinishDecision | null } {
  const [first, ...rest] = walk.locations;
  if (!first) return { state: startAutoFinish({ latitude: 0, longitude: 0 }, walk.startTime, false), decision: null };
  let state = startAutoFinish(first, walk.startTime, enabled);
  for (const fix of rest) {
    const step = evaluateAutoFinish(state, fix, fix.timestamp);
    state = step.state;
    if (step.decision) return { state, decision: step.decision };
  }
  return evaluateAutoFinish(state, null, now);
}

export function decideWalkRestore(walk: Walk, now: number, autoFinishEnabled: boolean): RestoreDecision {
  const lastFixAt = walk.locations.length > 0 ? walk.locations[walk.locations.length - 1].timestamp : walk.startTime;
  const ageMs = Math.max(0, now - lastFixAt);

  if (ageMs >= RESTORE_MAX_AGE_MS) {
    // Too little to be a walk (the start point alone, or one more) or it never went anywhere: drop it without a word.
    if (walk.locations.length < 2 || !walkHasMovement(walk)) return { kind: 'discard' };
    return { kind: 'finish', endedBy: 'auto-still', reason: 'stale' };
  }

  const replay = replayAutoFinish(walk, autoFinishEnabled, now);
  if (replay.decision) {
    // The walk would have ended while the app was away; with no movement that means "never was a walk".
    if (!walkHasMovement(walk)) return { kind: 'discard' };
    return { kind: 'finish', endedBy: replay.decision === 'home' ? 'auto-home' : 'auto-still', reason: replay.decision };
  }
  return { kind: 'resume', autoFinish: replay.state };
}

/** Whole minutes since the newest fix, for the restore log lines. */
export function restoreAgeMinutes(walk: Walk, now: number): number {
  const lastFixAt = walk.locations.length > 0 ? walk.locations[walk.locations.length - 1].timestamp : walk.startTime;
  return Math.max(0, Math.round((now - lastFixAt) / 60000));
}

/**
 * Adds stored fixes the in-memory walk lacks: newer than `sinceTimestamp` (the restored walk's newest fix) and not already
 * present, kept in time order. The stored copy can be ahead of memory (fixes that landed while the UI was still starting),
 * and the live watcher may already have appended a newer fix, so "newer than the newest in memory" would drop the gap.
 */
export function mergeNewerFixes(walk: Walk, stored: Walk['locations'], sinceTimestamp?: number): Walk {
  const since =
    sinceTimestamp ?? (walk.locations.length > 0 ? walk.locations[walk.locations.length - 1].timestamp : Number.NEGATIVE_INFINITY);
  const have = new Set(walk.locations.map((fix) => fix.timestamp));
  const extra = stored.filter((fix) => fix.timestamp > since && !have.has(fix.timestamp));
  if (extra.length === 0) return walk;
  return { ...walk, locations: [...walk.locations, ...extra].sort((a, b) => a.timestamp - b.timestamp) };
}
