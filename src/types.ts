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
}

export interface AppState {
  walk: Walk | null;
  isTracking: boolean;
  error: string | null;
}
