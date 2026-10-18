// Decides which in-walk audio cue (if any) to play. Pure: no audio, no React.
// Spec: interaction during a walk is audio-first (phone stays in the pocket),
// subtle dings only. App.tsx feeds it cumulative counts from the GPS callback
// and plays whatever comes back via sounds.play().
import type { SoundName } from './sounds';

export type WalkCue = Extract<SoundName, 'new-street' | 'reward-reached' | 'walk-done'>;

/** At most one new-street ding per this many ms. */
export const NEW_STREET_MIN_GAP_MS = 20_000;
/** New-ground cells that must accumulate since the last cue before a ding. */
export const NEW_STREET_MIN_NEW_CELLS = 3;

export interface WalkCueTracker {
  /** Cumulative counts for the walk so far. Returns the cue to play, or null. */
  onCells(paintedCount: number, newGroundCount: number): WalkCue | null;
  /** Finish Walk tap. 'walk-done' unless the walk qualified (celebration jingle carries it). */
  onFinish(qualified: boolean): WalkCue | null;
  /** Call on startWalk / cancel. */
  reset(): void;
}

export function createWalkCueTracker(opts: {
  now: () => number;
  minCells: number;
  newGroundMin?: number;
}): WalkCueTracker {
  const newGroundMin = opts.newGroundMin ?? NEW_STREET_MIN_NEW_CELLS;
  let rewardFired = false;
  let finished = false;
  let lastCueAt: number | null = null;
  let newGroundAtLastCue = 0;

  return {
    onCells(paintedCount, newGroundCount) {
      if (finished) return null;
      const t = opts.now();
      if (!rewardFired && paintedCount >= opts.minCells) {
        rewardFired = true;
        // Counts as a cue so a new-street ding doesn't stack right on top.
        lastCueAt = t;
        newGroundAtLastCue = newGroundCount;
        return 'reward-reached';
      }
      const fresh = newGroundCount - newGroundAtLastCue;
      if (fresh >= newGroundMin && (lastCueAt === null || t - lastCueAt >= NEW_STREET_MIN_GAP_MS)) {
        lastCueAt = t;
        newGroundAtLastCue = newGroundCount;
        return 'new-street';
      }
      return null;
    },
    onFinish(qualified) {
      if (finished) return null;
      finished = true;
      return qualified ? null : 'walk-done';
    },
    reset() {
      rewardFired = false;
      finished = false;
      lastCueAt = null;
      newGroundAtLastCue = 0;
    },
  };
}
