import { useState } from 'react';
import { WalkRewardsCelebration } from '../economy/walkRewards';
import { TerritoryBeat } from './finishTrackedWalk';

export interface CelebrationState {
  /** Id of the walk behind the celebration; seeds the headline pick. */
  walkId: string;
  rewards: WalkRewardsCelebration;
  territoryBeat: TerritoryBeat | null;
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
