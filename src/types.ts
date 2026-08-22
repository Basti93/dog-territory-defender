export interface Location {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
}

export type WalkStartSource = 'button' | 'manual-log';

export interface Walk {
  id: string;
  startTime: number;
  locations: Location[];
  /**
   * True when this walk painted enough Home Range ground to qualify for a
   * reward (see openspec/changes/home-range's "Reward Eligibility Is Ground
   * Covered, Not Loop Closure" requirement) — every finished tracked walk is
   * saved and paints the Home Range regardless of this flag; it no longer
   * means "formed a closed loop." A manually-logged walk is always `true`
   * (it always earns the flat per-walk reward, per walk-lifecycle).
   */
  closed: boolean;
  startSource: WalkStartSource;
  /**
   * This walk's own painted cells that were New Ground discoveries at the
   * time it happened (see utils/grid.ts's newGroundCells) — set once, right
   * before this walk is first saved. Optional/additive: undefined for a walk
   * saved before this field existed, or for a manual log (which structurally
   * cannot discover new ground). See openspec/changes/walk-portrait/design.md
   * Decision 4 — distinct from HomeRangeRepository's singleton
   * NewGroundEvent, which only ever remembers the single most recent
   * discovery, not this walk's own.
   */
  newGroundCellIds?: string[];
  /**
   * Treats earned by this walk, written via a second `saveWalk` patch right
   * after `awardWalkRewards` resolves (see openspec/changes/walk-portrait/
   * design.md Decision 5). Undefined for a walk that never qualified for a
   * reward, or one saved before this field existed.
   */
  treatsEarned?: number;
  /**
   * For a manually-logged walk only: which previously-tracked walk's route
   * (if any) it refreshed, set at the same point the refresh is applied (see
   * openspec/changes/walk-portrait/design.md Decision 6). Undefined when no
   * route was refreshed, or for any tracked walk. If the referenced walk is
   * later deleted, callers must treat a failed lookup as "no linked route" —
   * never a broken reference or crash.
   */
  refreshedRouteWalkId?: string;
}

export interface AppState {
  walk: Walk | null;
  isTracking: boolean;
  error: string | null;
}
