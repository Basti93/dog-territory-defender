export interface Location {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
}

export type WalkStartSource = 'button' | 'manual-log';

/** Why a walk stays out of averages and records (src/walks/walkRepair.ts). */
export type StatsExcludedReason = 'too_short' | 'stuck' | 'gps_glitch';

export interface Walk {
  id: string;
  startTime: number;
  locations: Location[];
  /**
   * True when this walk painted enough Home Range ground to qualify for a
   * reward (see docs/decisions/2026-08-21-home-range.md's "Reward Eligibility Is Ground
   * Covered, Not Loop Closure" requirement) — every finished tracked walk is
   * saved and paints the Home Range regardless of this flag; it no longer
   * means "formed a closed loop." A manually-logged walk is always `true`
   * (it always earns the flat per-walk reward, per walk-lifecycle).
   */
  closed: boolean;
  startSource: WalkStartSource;
  /** Set when the app finished the walk itself (auto-finish). Local only: never part of the server upload (sync/outbox.ts builds its payload field by field). */
  endedBy?: 'auto-home' | 'auto-still';
  /**
   * This walk's own painted cells that were New Ground discoveries at the
   * time it happened (see utils/grid.ts's newGroundCells) — set once, right
   * before this walk is first saved. Optional/additive: undefined for a walk
   * saved before this field existed, or for a manual log (which structurally
   * cannot discover new ground). See docs/decisions/walk-portrait.md
   * Decision 4 — distinct from HomeRangeRepository's singleton
   * NewGroundEvent, which only ever remembers the single most recent
   * discovery, not this walk's own.
   */
  newGroundCellIds?: string[];
  /**
   * Neighbour dogs (archetype ids: momo, pfote, bruno, keks, lotte, nebel; at most 3) that were out while this walk ran.
   * Server-derived and filled in from the upload response or a pull; absent on old walks and when none were met.
   */
  metNeighbourIds?: string[];
  /**
   * Treats earned by this walk, written via a second `saveWalk` patch right
   * after `awardWalkRewards` resolves (see docs/decisions/walk-portrait.md
   * design.md Decision 5). Undefined for a walk that never qualified for a
   * reward, or one saved before this field existed.
   */
  treatsEarned?: number;
  /**
   * For a manually-logged walk only: which previously-tracked walk's route
   * (if any) it refreshed, set at the same point the refresh is applied (see
   * docs/decisions/walk-portrait.md Decision 6). Undefined when no
   * route was refreshed, or for any tracked walk. If the referenced walk is
   * later deleted, callers must treat a failed lookup as "no linked route" —
   * never a broken reference or crash.
   */
  refreshedRouteWalkId?: string;
  /** Household sync (multiplayer-sync): who walked it. Set on walks that came from the server; absent on purely local walks. */
  playerId?: string;
  playerName?: string;
  /**
   * Statistics view (src/walks/walkRepair.ts analyseWalk), additive: absent on a walk not analysed yet. Never touches rewards or cells.
   * `statsEndTime` = last meaningful fix (an idle tail is cut), `statsDistanceM` = distance up to it, `statsExcluded` = why the
   * walk does not count in the diary and records. `statsVersion` = the rule set that produced them.
   */
  statsVersion?: number;
  statsEndTime?: number;
  statsDistanceM?: number;
  statsExcluded?: StatsExcludedReason;
}

export interface AppState {
  walk: Walk | null;
  isTracking: boolean;
  error: string | null;
}
