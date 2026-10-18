import { WalkCue, WalkCueTracker } from '../feedback/walkCues';
import { newGroundCells, paintedCells } from '../utils/grid';
import { AppState, Location as WalkLocation } from '../types';

/**
 * Mutable bookkeeping for the in-walk audio cues. Lives in a ref (nothing
 * renders from it). `range` is the Home Range snapshot taken at walk start
 * (null = not loaded yet, so no new-street dings rather than false ones).
 */
export interface WalkCueState {
  active: boolean;
  range: Set<string> | null;
  painted: Set<string>;
  newGround: Set<string>;
  last: WalkLocation | null;
}

export function createWalkCueState(): WalkCueState {
  return { active: false, range: null, painted: new Set(), newGround: new Set(), last: null };
}

/** Re-arm the cue state for a new walk that starts at `initialLoc`. */
export function startWalkCueState(state: WalkCueState, initialLoc: WalkLocation): void {
  state.active = true;
  state.range = null;
  state.painted = paintedCells([initialLoc]);
  state.newGround = new Set();
  state.last = initialLoc;
}

/** Re-arm the cue state for a walk that is being resumed with `locations` already recorded (never empty). */
export function resumeWalkCueState(state: WalkCueState, locations: WalkLocation[]): void {
  state.active = true;
  state.range = null;
  state.painted = paintedCells(locations);
  state.newGround = new Set();
  state.last = locations[locations.length - 1] ?? null;
}

/**
 * Feed one GPS fix into the cue state (incremental painting) and return the
 * cue to play, if any. No-op while inactive or before the first fix.
 */
export function applyLocationToCues(state: WalkCueState, location: WalkLocation, tracker: WalkCueTracker): WalkCue | null {
  if (!state.active || !state.last) return null;
  const added = paintedCells([state.last, location]);
  state.last = location;
  for (const c of added) state.painted.add(c);
  if (state.range) {
    for (const c of newGroundCells(added, state.range)) state.newGround.add(c);
  }
  return tracker.onCells(state.painted.size, state.newGround.size);
}

/** AppState reducer step for a GPS fix: ignored while there is no walk. */
export function appendLocation(prev: AppState, location: WalkLocation): AppState {
  if (!prev.walk) return prev;
  return { ...prev, walk: { ...prev.walk, locations: [...prev.walk.locations, location] } };
}
