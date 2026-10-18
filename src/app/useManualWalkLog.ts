import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Walk } from '../types';
import { paintedCells, parseCellKey } from '../utils/grid';
import { isWithinManualLogWindow, MissedWalkTiming, startTimeForMissedWalk } from '../utils/manualWalkLog';
import { canOfferRouteRefreshToday, evaluateManualLogQuota, recordManualLogUsage } from '../economy/denEconomy';
import { manualLogBloomMultiplier } from '../economy/formulas';
import { awardWalkRewards } from '../economy/walkRewards';
import { checkAndScheduleWalkReminder } from '../notifications/walkReminder';
import { log } from '../utils/log';
import { t } from '../i18n';
import { AppRepositories } from './repositories';
import { WalkRewardsOutcome } from './finishTrackedWalk';

/**
 * "Log a walk we missed" — a standalone, one-step, direct-reward action. No
 * live GPS trail, no polygon, no notification tied to it. Reuses the exact
 * same reward path a tracked walk gets, via awardWalkRewards. See
 * openspec/changes/home-range/design.md Decision 4 and denEconomy.ts's
 * evaluateManualLogQuota/recordManualLogUsage for the cap rules.
 */
export function useManualWalkLog(
  repos: AppRepositories,
  deps: {
    /** True while the Log a Missed Walk screen is open. */
    screenOpen: boolean;
    onRangeChanged: () => void;
    /** Success: treats/level changed, celebration to show, return to the Doorstep. */
    onLogged: (outcome: WalkRewardsOutcome) => void;
  }
) {
  const { denEconomyRepository, walkRepository, homeRangeRepository, notificationRepository, personalStatsRepository } = repos;
  const [routeRefreshAvailable, setRouteRefreshAvailable] = useState(false);

  // Recomputed each time "Log a walk we missed" opens — home-range design.md
  // Decision 4's "at most 1 route refresh per calendar day" cap.
  // LogMissedWalkScreen only offers the route picker when this is true.
  useEffect(() => {
    if (!deps.screenOpen) return;
    denEconomyRepository.getState().then((state) => {
      setRouteRefreshAvailable(canOfferRouteRefreshToday(state, Date.now()));
    });
  }, [deps.screenOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const logMissedWalk = async (timing: MissedWalkTiming, refreshRouteWalkId?: string) => {
    const now = Date.now();
    const startTime = startTimeForMissedWalk(timing, now);

    if (!isWithinManualLogWindow(startTime, now)) {
      Alert.alert(t('app.tooFarBackTitle'), t('app.tooFarBackMessage'));
      return;
    }

    const denStateBefore = await denEconomyRepository.getState();
    const quota = evaluateManualLogQuota(denStateBefore, now, !!refreshRouteWalkId);
    if (!quota.allowed) {
      Alert.alert(t('app.alreadyLoggedTitle'), t('app.alreadyLoggedMessage'));
      return;
    }

    const manualWalk: Walk = {
      id: `manual-${now}`,
      startTime,
      locations: [],
      closed: true,
      startSource: 'manual-log',
    };

    log('WALK_MANUAL_LOG', { id: manualWalk.id, timing, refreshRouteWalkId, canRefreshRoute: quota.canRefreshRoute });

    try {
      await walkRepository.saveWalk(manualWalk);
      log('STORAGE_WALK_SAVED', { id: manualWalk.id, closed: true, startSource: 'manual-log' });
      // walk-reminder design.md Decision 4: recheck right after a walk is manually logged.
      await checkAndScheduleWalkReminder({ walkRepository, notificationRepository }).catch((err) =>
        log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
      );

      let bloom = 1;
      let refreshApplied = false;
      if (quota.canRefreshRoute && refreshRouteWalkId) {
        const routeWalk = await walkRepository.getWalk(refreshRouteWalkId);
        // The picker only ever offers the player's own previously-tracked
        // walks, so this should always resolve — defensive null-check only.
        if (routeWalk) {
          const routeCells = paintedCells(routeWalk.locations);
          if (routeCells.size > 0) {
            await homeRangeRepository.paintCells(
              Array.from(routeCells).map((id) => {
                const { ix, iy } = parseCellKey(id);
                return { ix, iy, refreshedAt: now, tracked: false };
              })
            );
            deps.onRangeChanged();
            bloom = manualLogBloomMultiplier();
            refreshApplied = true;
          }
        }
      }

      // Record the manual log (and, if used, the route refresh) before
      // awarding rewards, so awardWalkRewards's own getState()/saveState()
      // round-trip picks up and preserves this bookkeeping.
      await denEconomyRepository.saveState(recordManualLogUsage(denStateBefore, now, refreshApplied));

      const result = await awardWalkRewards(
        manualWalk,
        0,
        0,
        { denEconomyRepository, personalStatsRepository, walkRepository },
        0,
        bloom
      );
      deps.onLogged({
        walkId: manualWalk.id,
        treats: result.denEconomyState.treats,
        level: result.denEconomyState.level,
        celebration: result.celebration,
        territoryBeat: null,
      });

      // Combined second patch write (walk-portrait design.md Decision 6):
      // which route (if any) this log refreshed, plus its treatsEarned.
      // Never user-visible.
      try {
        await walkRepository.saveWalk({
          ...manualWalk,
          ...(refreshApplied && refreshRouteWalkId ? { refreshedRouteWalkId: refreshRouteWalkId } : {}),
          treatsEarned: result.celebration.treatsEarned,
        });
      } catch (err) {
        log('STORAGE_WALK_TREATS_PATCH_ERROR', { id: manualWalk.id, error: String(err) });
      }
    } catch (err) {
      console.error('Failed to log missed walk:', err);
      log('WALK_MANUAL_LOG_ERROR', { id: manualWalk.id, error: String(err) });
    }
  };

  return { logMissedWalk, routeRefreshAvailable };
}
