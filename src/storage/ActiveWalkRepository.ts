import type { Location, Walk } from '../types';

// The durable mirror of the walk in flight. The running app keeps the walk in memory (useWalkSession's walkRef);
// this exists so a closed or killed app can pick the walk up again (see docs/decisions/LOG.md, 2026-10-18).
// At most ONE active walk exists at a time.

/** What identifies the walk; everything else (points) is stored as fixes. */
export type ActiveWalkMeta = Pick<Walk, 'id' | 'startTime' | 'startSource'>;

export interface ActiveWalkSnapshot {
  meta: ActiveWalkMeta;
  /** Oldest first, including the walk's first point. */
  locations: Location[];
}

export interface ActiveWalkRepository {
  /** A walk began: replaces any previous active walk with this one and its first point(s). */
  start(meta: ActiveWalkMeta, locations: Location[]): Promise<void>;
  /**
   * Adds fixes to the active walk. Ignored when `walkId` is not the active walk (a late flush after finish/cancel
   * must never leak into the next walk). Fixes not newer than the newest stored one are skipped, so two writers
   * (or a replayed batch) cannot duplicate points.
   */
  appendFixes(walkId: string, fixes: Location[]): Promise<void>;
  /** The active walk with all its points, or null. */
  load(): Promise<ActiveWalkSnapshot | null>;
  /** The walk is over (finished, cancelled, discarded). */
  clear(): Promise<void>;
}
