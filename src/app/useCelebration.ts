import { useState } from 'react';
import { WalkRewardsCelebration } from '../economy/walkRewards';
import { TerritoryBeat } from './finishTrackedWalk';

export interface CelebrationState {
  /** Id of the walk behind the celebration; seeds the closing-line pick. */
  walkId: string;
  rewards: WalkRewardsCelebration;
  territoryBeat: TerritoryBeat | null;
  /** Walk length in metres; absent for a manual log. */
  distanceMeters?: number;
  /** Territory the walk was credited to (place-aware closing line); absent for a manual log. */
  territoryName?: string | null;
  /** When the walk happened (ms epoch); drives the weekday/time-of-day phrase. Defaults to now. */
  walkTime?: number;
  /** A manually logged walk gets the short two-beat homecoming. */
  manual?: boolean;
}

/** The one-off reward moment shown on top of everything else until "Nice walk!". */
export function useCelebration() {
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  return {
    celebration,
    showCelebration: setCelebration,
    dismissCelebration: () => setCelebration(null),
  };
}
