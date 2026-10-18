import { useEffect, useState } from 'react';

import type { PersonalStatsRepository } from '../../storage/PersonalStatsRepository';
import { EmptyHook, FenceBadge, fenceBadgeList, pickEmptyHook } from './fencePlan';

export interface FenceData {
  badges: FenceBadge[];
  hook: EmptyHook | null;
}

const EMPTY: FenceData = { badges: [], hook: null };

/**
 * Reads the unlocked badges and the stats once per scene mount, and again whenever `refreshKey` changes (a walk was
 * finished, a Den upgrade unlocked something, the homecoming started or ended). Nothing here ticks or polls.
 */
export function useFenceBadges(repository: PersonalStatsRepository, refreshKey: string): FenceData {
  const [data, setData] = useState<FenceData>(EMPTY);
  useEffect(() => {
    let alive = true;
    Promise.all([repository.getUnlockedAchievements(), repository.getState()])
      .then(([unlocked, stats]) => {
        if (alive) setData({ badges: fenceBadgeList(unlocked), hook: pickEmptyHook(stats, unlocked) });
      })
      .catch(() => {
        // A failed read leaves the fence as it was; it is decoration.
      });
    return () => {
      alive = false;
    };
  }, [repository, refreshKey]);
  return data;
}
