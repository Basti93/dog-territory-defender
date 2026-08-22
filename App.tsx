import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import { Walk, AppState as AppStateType } from './src/types';
import { requestLocationPermission, startWatchingLocation, stopWatchingLocation, getInitialLocation } from './src/utils/gps';
import { cumulativeDistance } from './src/utils/geometry';
import { cellCentre, cellKey, MIN_CELLS_FOR_REWARD, NEW_GROUND_MIN_CELLS, newGroundCells, paintedCells, parseCellKey } from './src/utils/grid';
import { isWithinManualLogWindow, MissedWalkTiming, startTimeForMissedWalk } from './src/utils/manualWalkLog';
import { resolveCelebrationTerritoryBeat, resolveTerritoryChanges } from './src/utils/territoryCluster';
import { resolveTerritoryName } from './src/utils/streetLookup';
import { MapView } from './src/components/MapView';
import { SomewhereWildCard, SomewhereWildSpot } from './src/components/SomewhereWildCard';
import { TerritoriesScreen } from './src/components/TerritoriesScreen';
import { createSqliteWalkRepository } from './src/storage/sqliteWalkRepository';
import { createSqliteHomeRangeRepository } from './src/storage/sqliteHomeRangeRepository';
import { createSqliteTerritoryRepository } from './src/storage/sqliteTerritoryRepository';
import { runHomeRangeMigrationIfNeeded } from './src/storage/homeRangeMigration';
import { runTerritoryMigrationIfNeeded } from './src/storage/territoryMigration';
import { WalkHistoryScreen } from './src/components/WalkHistoryScreen';
import { WalkPortraitScreen } from './src/components/WalkPortraitScreen';
import { StoredWalk } from './src/storage/WalkRepository';
import { DenScreen } from './src/components/DenScreen';
import { DoorstepScreen } from './src/components/DoorstepScreen';
import { CelebrationScreen } from './src/components/CelebrationScreen';
import { DebugLogScreen } from './src/components/DebugLogScreen';
import { StatsScreen } from './src/components/StatsScreen';
import { LogMissedWalkScreen } from './src/components/LogMissedWalkScreen';
import { DogNamePromptScreen } from './src/components/DogNamePromptScreen';
import { createSqliteDenEconomyRepository } from './src/storage/sqliteDenEconomyRepository';
import { createSqlitePersonalStatsRepository } from './src/storage/sqlitePersonalStatsRepository';
import { createSqliteNotificationRepository } from './src/storage/sqliteNotificationRepository';
import {
  applyPassiveAccrual,
  canOfferRouteRefreshToday,
  dogDisplayName,
  evaluateManualLogQuota,
  recordManualLogUsage,
  reconcileBuddyLevelCatchUp,
} from './src/economy/denEconomy';
import { bloomMultiplier, manualLogBloomMultiplier } from './src/economy/formulas';
import { territoryMass, territoryRate } from './src/economy/territoryEconomy';
import { AchievementId, recordTreatsEarned } from './src/economy/personalStats';
import { awardWalkRewards, WalkRewardsCelebration } from './src/economy/walkRewards';
import { checkAndScheduleEarnedTriggerNotification } from './src/notifications/earnedTrigger';
import { resolveDoorstepOverflowLine } from './src/notifications/notificationDecision';
import { DEN_OVERFLOW_NOTIFICATION_DATA } from './src/notifications/scheduler';
import { log } from './src/utils/log';

const walkRepository = createSqliteWalkRepository();
const homeRangeRepository = createSqliteHomeRangeRepository();
const territoryRepository = createSqliteTerritoryRepository();
const denEconomyRepository = createSqliteDenEconomyRepository();
const personalStatsRepository = createSqlitePersonalStatsRepository();
const notificationRepository = createSqliteNotificationRepository();

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

export default function App() {
  const [appState, setAppState] = useState<AppStateType>({
    walk: null,
    isTracking: false,
    error: null,
  });
  const [showHistory, setShowHistory] = useState(false);
  // The Walk Portrait (openspec/changes/walk-portrait) — mirrors
  // `celebration`'s existing nullable-object convention (design.md Decision
  // 8), not a new boolean paired with a separately-tracked walk. Rendered
  // while `showHistory` remains true underneath, so dismissing it returns to
  // the still-mounted history list, not the map.
  const [viewingWalk, setViewingWalk] = useState<StoredWalk | null>(null);
  const [showDen, setShowDen] = useState(false);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showLogMissedWalk, setShowLogMissedWalk] = useState(false);
  // The Doorstep (openspec/changes/home-dashboard) — shown once per app cold
  // start, right after the dog-naming gate, then dismissed for the rest of
  // this process's life (never reset back to true).
  const [showDoorstep, setShowDoorstep] = useState(true);
  const [homeRangeRefreshKey, setHomeRangeRefreshKey] = useState(0);
  const [treats, setTreats] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [dogName, setDogName] = useState<string | null>(null);
  const [needsDogName, setNeedsDogName] = useState(false);
  const [pendingDenAchievements, setPendingDenAchievements] = useState<AchievementId[]>([]);
  // Passed down to DoorstepScreen as already-computed values — re-deriving
  // either after this mount effect has already advanced lastTickAt/consumed
  // the achievement queue would silently produce ~0 or an empty queue (see
  // openspec/changes/home-dashboard/design.md Decision 7).
  const [accruedDelta, setAccruedDelta] = useState(0);
  const [previousLastTickAt, setPreviousLastTickAt] = useState<number | null>(null);
  // Resolved+claimed by the merged mount effect below, before
  // checkAndScheduleEarnedTriggerNotification runs (design.md Decision 6) —
  // never re-derived inside DoorstepScreen itself.
  const [showOverflowLine, setShowOverflowLine] = useState(false);
  const [celebration, setCelebration] = useState<WalkRewardsCelebration | null>(null);
  const [routeRefreshAvailable, setRouteRefreshAvailable] = useState(false);
  // "Somewhere Wild" (openspec/changes/somewhere-wild): the marker and the
  // card are both driven from this single piece of state, so they always
  // agree on the same spot (design.md's "why one change" note).
  const [wildSpot, setWildSpot] = useState<SomewhereWildSpot | null>(null);
  const [panToSpot, setPanToSpot] = useState<(SomewhereWildSpot & { requestId: number }) | null>(null);
  // Territories (openspec/changes/territories) — the list screen's own
  // showX boolean-toggle, mirroring every other screen in this file.
  const [showTerritories, setShowTerritories] = useState(false);
  // The territory-related celebration beats for the walk currently shown on
  // CelebrationScreen — resolved alongside `celebration` in finishWalk,
  // reset together with it on "Nice walk!" (design.md Decision 3, tasks.md
  // task 6.2).
  const [territoryBeat, setTerritoryBeat] = useState<{
    newTerritoryName: string | null;
    mergedTerritoryNames: [string, string] | null;
  } | null>(null);
  // True only on the one app-open where territoryIncomeRevealed flipped this
  // session (design.md Decision 6's one-off discovery beat) — computed once
  // in the merged mount effect below, passed straight to DoorstepScreen,
  // never re-derived there. territoryIncomeRate is the current global rate,
  // needed by both the one-off reveal line and the permanent footer line.
  const [justRevealedTerritoryIncome, setJustRevealedTerritoryIncome] = useState(false);
  const [territoryIncomeRate, setTerritoryIncomeRate] = useState(0);

  // Recomputed each time "Log a walk we missed" opens — see
  // src/economy/denEconomy.ts's canOfferRouteRefreshToday and
  // openspec/changes/home-range/design.md Decision 4's "at most 1 route
  // refresh per calendar day" cap. LogMissedWalkScreen only offers the
  // route picker when this is true.
  useEffect(() => {
    if (!showLogMissedWalk) return;
    denEconomyRepository.getState().then((state) => {
      setRouteRefreshAvailable(canOfferRouteRefreshToday(state, Date.now()));
    });
  }, [showLogMissedWalk]);

  // Initialize location permission
  useEffect(() => {
    (async () => {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setAppState((prev) => ({
          ...prev,
          error: 'Location permission denied',
        }));
      }
    })();
  }, []);

  // One-time backfill of every previously saved tracked walk into the Home
  // Range grid, then — only once that's done, since it needs a populated
  // Range to cluster (openspec/changes/territories/tasks.md task 3.3) — the
  // one-time Territory partition backfill. Both are idempotent (guarded by
  // their own DenEconomyState flags), safe to call on every app load. See
  // storage/homeRangeMigration.ts / storage/territoryMigration.ts.
  useEffect(() => {
    runHomeRangeMigrationIfNeeded({ walkRepository, homeRangeRepository, denEconomyRepository })
      .then(() =>
        runTerritoryMigrationIfNeeded({
          homeRangeRepository,
          territoryRepository,
          denEconomyRepository,
          resolveTerritoryName,
        })
      )
      .then(() => setHomeRangeRefreshKey((k) => k + 1))
      .catch((err) => log('HOME_RANGE_MIGRATION_ERROR', { error: String(err) }));
  }, []);

  // Tapping the earned-trigger notification opens the Den screen — both for a
  // response received while the app is running/backgrounded, and for a cold
  // start launched by tapping the notification.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.type === DEN_OVERFLOW_NOTIFICATION_DATA.type) {
        setShowDen(true);
      }
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification.request.content.data?.type === DEN_OVERFLOW_NOTIFICATION_DATA.type) {
        setShowDen(true);
      }
    });

    return () => subscription.remove();
  }, []);

  // Apply passive treat accrual since last open, reconcile Buddy's Level
  // against the current xpGrowth curve (tasks.md task 7.2 — see
  // reconcileBuddyLevelCatchUp's doc comment for why this can lag), then
  // resolve the Doorstep's own overflow-line claim and only then check the
  // earned-trigger push notification.
  //
  // openspec/changes/home-dashboard/design.md Decision 6: this used to be
  // two independent mount effects (this one, plus a separate
  // checkAndScheduleEarnedTriggerNotification effect) racing on mount with
  // no ordering guarantee. That's merged into one sequential routine here —
  // the Doorstep-facing overflow-line resolution (including its
  // notificationRepository.saveState write, if it decides to show the line)
  // now always completes BEFORE checkAndScheduleEarnedTriggerNotification
  // runs, so the two channels never both surface the same unclaimed
  // overflow in one app-open (see src/notifications/__tests__/earnedTrigger.test.ts).
  useEffect(() => {
    (async () => {
      const state = await denEconomyRepository.getState();
      const previousTick = state.lastTickAt;
      // worldMass (openspec/changes/territories/design.md Decision 6) is a
      // single ungrouped aggregate over the whole cells table, independent
      // of territory partitioning/migration status — safe to read even
      // before the territory migration above has run.
      const worldMass = await homeRangeRepository.getWorldMass();
      const accrued = applyPassiveAccrual(state, Date.now(), worldMass);
      const { state: reconciled, caughtUpToLevel } = reconcileBuddyLevelCatchUp(accrued);
      await denEconomyRepository.saveState(reconciled);
      log('TREATS_PASSIVE_ACCRUAL', {
        before: state.treats,
        after: accrued.treats,
        elapsedHours: (Date.now() - state.lastTickAt) / (1000 * 60 * 60),
      });
      setTreats(reconciled.treats);
      setLevel(reconciled.level);
      setDogName(reconciled.dogName);
      setNeedsDogName(reconciled.dogName === null);

      if (caughtUpToLevel !== null) {
        log('LEVEL_CURVE_CATCH_UP', { before: state.level, caughtUpToLevel });
        // Accepted verbatim copy shape (openspec/changes/virtual-dog-companion) —
        // distinct from the normal per-walk level-up beat, since no walk
        // earned this jump (a curve retune did). See design.md task 7.2/7.3.
        Alert.alert(`${dogDisplayName(reconciled.dogName)} caught up — Level ${caughtUpToLevel}`);
      }

      const delta = accrued.treats - state.treats;
      setAccruedDelta(delta);

      // openspec/changes/territories/design.md Decision 6: the reveal flag
      // flips at most once, ever — this is true only on the specific open
      // where that flip just happened.
      setJustRevealedTerritoryIncome(!state.territoryIncomeRevealed && reconciled.territoryIncomeRevealed);
      setTerritoryIncomeRate(territoryRate(territoryMass(worldMass.cellCount, worldMass.visitsSum), reconciled.level));
      if (delta > 0) {
        const personalStats = await personalStatsRepository.getState();
        const { stats: nextPersonalStats, newlyUnlocked } = recordTreatsEarned(personalStats, delta);
        await personalStatsRepository.saveState(nextPersonalStats);
        if (newlyUnlocked.length > 0) {
          await personalStatsRepository.unlockAchievements(newlyUnlocked, Date.now());
          setPendingDenAchievements(newlyUnlocked);
        }
      }

      const bookkeeping = await notificationRepository.getState();
      const { showLine, nextBookkeeping } = resolveDoorstepOverflowLine(reconciled, bookkeeping);
      if (nextBookkeeping !== bookkeeping) {
        await notificationRepository.saveState(nextBookkeeping);
      }
      setShowOverflowLine(showLine);

      // Recompute/reschedule the earned-trigger notification each time the
      // app opens (see openspec/changes/walk-start-notifications/design.md's
      // accepted check cadence — there's no backend to wake the app while
      // it's closed). Sequenced after the overflow-line claim above.
      await checkAndScheduleEarnedTriggerNotification({ denEconomyRepository, walkRepository, notificationRepository }).catch(
        (err) => log('NOTIFICATION_CHECK_ERROR', { error: String(err) })
      );

      // Set last, once every other Doorstep-facing value above (accruedDelta,
      // pendingDenAchievements, showOverflowLine) is already final — this is
      // the single prop DoorstepScreen's own mount effect waits on before
      // resolving its session, so it never locks in a session/away-strip
      // computed from still-default placeholder values (design.md Decision 3).
      setPreviousLastTickAt(previousTick);
    })();
  }, []);

  const submitDogName = async (name: string) => {
    const state = await denEconomyRepository.getState();
    const next = { ...state, dogName: name };
    await denEconomyRepository.saveState(next);
    setDogName(name);
    setNeedsDogName(false);
  };

  const startWalk = async () => {
    const initialLoc = await getInitialLocation();
    if (!initialLoc) {
      Alert.alert('Error', 'Could not get initial location');
      return;
    }

    const newWalk: Walk = {
      id: Date.now().toString(),
      startTime: Date.now(),
      locations: [initialLoc],
      closed: false,
      startSource: 'button',
    };

    log('WALK_START', { id: newWalk.id, lat: initialLoc.latitude, lon: initialLoc.longitude });

    setAppState((prev) => ({
      ...prev,
      walk: newWalk,
      isTracking: true,
    }));

    // Start watching location (foreground-service-backed, gps.ts manages the subscription internally)
    await startWatchingLocation((location) => {
      setAppState((prev) => {
        if (!prev.walk) return prev;

        const updatedWalk = {
          ...prev.walk,
          locations: [...prev.walk.locations, location],
        };

        return { ...prev, walk: updatedWalk };
      });
    });
  };

  // Finish Walk — replaces the old Close Territory/End Walk pair (design.md's
  // Technical Split Addendum: painting is decoupled from loop closure, so
  // there's nothing left for a separate "closed loop" action to mean). Every
  // finished tracked walk is saved and paints the Home Range regardless of
  // its shape; reward eligibility gates on the 25-painted-cell floor
  // (MIN_CELLS_FOR_REWARD) instead of the deleted canCloseWalk loop-closure
  // check.
  const finishWalk = async () => {
    await stopWatchingLocation();

    if (!appState.walk) {
      setAppState((prev) => ({ ...prev, isTracking: false }));
      return;
    }

    const walk = appState.walk;
    const painted = paintedCells(walk.locations);
    const qualifies = painted.size >= MIN_CELLS_FOR_REWARD;

    // Snapshot the Range before painting this walk's cells, so New Ground
    // detection AND the Fresh Ground bloomMultiplier both compare against
    // what existed *before* this walk (design.md Decisions 3 and 5) —
    // painting below would otherwise make every cell "already refreshed."
    const rangeBefore = await homeRangeRepository.getCells();
    const rangeBeforeSet = new Set(rangeBefore.map((c) => cellKey(c.ix, c.iy)));
    const rangeBeforeLastRefreshed = new Map(rangeBefore.map((c) => [cellKey(c.ix, c.iy), c.lastRefreshed]));
    const newGround = newGroundCells(painted, rangeBeforeSet);
    const bloom = bloomMultiplier(painted, rangeBeforeLastRefreshed, Date.now());

    const now = Date.now();

    // Persisted New Ground event (openspec/changes/somewhere-wild/design.md
    // Decision 4) — the "Somewhere Wild" card needs to still answer "was
    // there a recent discovery" up to 48h after this walk closes, long
    // after this in-memory newGround Set is gone. Same NEW_GROUND_MIN_CELLS
    // gate as the celebration beat above uses; overwrites any prior event.
    if (newGround.size >= NEW_GROUND_MIN_CELLS) {
      await homeRangeRepository.recordNewGroundEvent(now, Array.from(newGround));
    }

    // Territory resolution (openspec/changes/territories/design.md Decision
    // 3) — runs on every finished tracked walk that painted at least one
    // cell, using the same rangeBefore snapshot New Ground/Fresh Ground
    // already use. Manual logs never reach this function at all (they route
    // through logMissedWalk below, which never calls resolveTerritoryChanges
    // — design.md Decision 5's structural exclusion).
    const territoryIdByNewCellId = new Map<string, string>();
    let creditedTerritoryId: string | null = null;
    let resolvedTerritoryBeat: { newTerritoryName: string | null; mergedTerritoryNames: [string, string] | null } | null = null;
    let pendingMerges: Array<{ survivorId: string; loserId: string }> = [];

    if (painted.size > 0) {
      const existingTerritories = await territoryRepository.getTerritories();
      const territoryCreatedAt = new Map(existingTerritories.map((t) => [t.id, t.createdAt]));
      const plan = resolveTerritoryChanges(rangeBefore, painted, now, territoryCreatedAt);

      // Resolve each birth's name (reverse-geocode) and create its real
      // Territory row, mapping the plan's provisional ids to real ones.
      const birthNamesByProvisionalId = new Map<string, string>();
      const provisionalToRealId = new Map<string, string>();
      for (const birth of plan.births) {
        const [lat, lon] = cellCentre(birth.anchorCell.ix, birth.anchorCell.iy);
        const name = await resolveTerritoryName(lat, lon, dogName);
        const realId = await territoryRepository.createTerritory(name, now);
        birthNamesByProvisionalId.set(birth.provisionalId, name);
        provisionalToRealId.set(birth.provisionalId, realId);
      }
      const resolveRealId = (id: string) => provisionalToRealId.get(id) ?? id;

      for (const [cellId, id] of plan.newCellAssignments) {
        territoryIdByNewCellId.set(cellId, resolveRealId(id));
      }

      const territoryNamesById = new Map(existingTerritories.map((t) => [t.id, t.name] as const));
      for (const [provisionalId, name] of birthNamesByProvisionalId) {
        territoryNamesById.set(resolveRealId(provisionalId), name);
      }

      creditedTerritoryId = resolveRealId(plan.creditedTerritoryId);
      resolvedTerritoryBeat = resolveCelebrationTerritoryBeat(plan, birthNamesByProvisionalId, territoryNamesById);
      pendingMerges = plan.merges;
    }

    if (painted.size > 0) {
      await homeRangeRepository.paintCells(
        Array.from(painted).map((id) => {
          const { ix, iy } = parseCellKey(id);
          return { ix, iy, refreshedAt: now, tracked: true, territoryId: territoryIdByNewCellId.get(id) };
        })
      );
    }

    // Merge check runs AFTER this walk's own new cells are persisted above
    // (design.md Decision 3's own Step 3-then-Step-4 ordering) — a new cell
    // assimilated into a territory that turns out to be this walk's merge
    // loser must still end up on the survivor, and reassignCellsToTerritory
    // (a bulk "every cell currently in fromId" UPDATE) only sweeps that up
    // correctly if the new cell already exists in the table by the time it
    // runs.
    for (const merge of pendingMerges) {
      await homeRangeRepository.reassignCellsToTerritory(merge.loserId, merge.survivorId);
      await territoryRepository.mergeTerritoryStats(merge.survivorId, merge.loserId);
    }

    // newGroundCellIds (openspec/changes/walk-portrait/design.md Decision 4):
    // the exact same newGround Set already computed above for the
    // NewGroundEvent/bloomMultiplier — no new computation, only a new write
    // of an already-computed value, so the Walk Portrait can later highlight
    // this walk's own New Ground segments (distinct from the singleton
    // NewGroundEvent above, which only ever remembers the single most recent
    // discovery across all walks).
    const finishedWalk: Walk = { ...walk, closed: qualifies, newGroundCellIds: Array.from(newGround) };

    log('WALK_FINISHED', {
      id: finishedWalk.id,
      points: finishedWalk.locations.length,
      cellsPainted: painted.size,
      newGroundCells: newGround.size,
      qualifies,
    });

    setAppState((prev) => ({
      ...prev,
      walk: finishedWalk,
      isTracking: false,
    }));

    try {
      await walkRepository.saveWalk(finishedWalk);
      log('STORAGE_WALK_SAVED', { id: finishedWalk.id, closed: qualifies });
    } catch (err) {
      console.error('Failed to save walk:', err);
      log('STORAGE_WALK_SAVE_ERROR', { id: finishedWalk.id, error: String(err) });
    }

    // Refresh the idle map's Home Range render now that new cells (if any)
    // are persisted — mirrors the old territoryRefreshKey's job.
    setHomeRangeRefreshKey((k) => k + 1);

    if (!qualifies) {
      // Territory attribution (walksHere += 1) still happens for a walk
      // that painted ground but didn't clear the rewards floor — Home Range
      // painting itself already doesn't gate on `qualifies` either. No
      // treats were earned, so treatsIncrement is 0.
      if (creditedTerritoryId) {
        await territoryRepository.incrementTerritoryStats(creditedTerritoryId, { walksIncrement: 1, treatsIncrement: 0 });
      }
      // Mirrors today's "closes but doesn't qualify" non-outcome: the walk
      // is saved and its cells are painted, but there's no reward and no
      // celebration screen (and so no territory discovery/merge beat either
      // — the beat is discovery's payoff, tied to the same celebration
      // moment as every other beat).
      return;
    }

    const distanceMeters = cumulativeDistance(finishedWalk.locations);
    try {
      const result = await awardWalkRewards(
        finishedWalk,
        distanceMeters,
        painted.size,
        { denEconomyRepository, personalStatsRepository, walkRepository },
        newGround.size,
        bloom
      );
      if (creditedTerritoryId) {
        await territoryRepository.incrementTerritoryStats(creditedTerritoryId, {
          walksIncrement: 1,
          treatsIncrement: result.celebration.treatsEarned,
        });
      }
      setTreats(result.denEconomyState.treats);
      setLevel(result.denEconomyState.level);
      setCelebration(result.celebration);
      setTerritoryBeat(resolvedTerritoryBeat);

      // Second patch write (openspec/changes/walk-portrait/design.md Decision
      // 5): records treatsEarned on this walk's own stored record now that
      // awardWalkRewards has resolved it, so the Walk Portrait's metadata row
      // can show it later. Never surfaces as a user-visible error — a failed
      // patch just leaves this walk without a treatsEarned figure to show,
      // logged the same way every other storage failure in this file is.
      try {
        await walkRepository.saveWalk({ ...finishedWalk, treatsEarned: result.celebration.treatsEarned });
      } catch (err) {
        log('STORAGE_WALK_TREATS_PATCH_ERROR', { id: finishedWalk.id, error: String(err) });
      }
    } catch (err) {
      console.error('Failed to award walk treats:', err);
    }
  };

  // "Log a walk we missed" — a standalone, one-step, direct-reward action.
  // No live GPS trail, no polygon, no notification tied to it (see
  // openspec/changes/walk-start-notifications/proposal.md's scope cut).
  // Reuses the exact same reward path a tracked walk gets, via
  // awardWalkRewards. `refreshRouteWalkId` (optional) is a previously
  // GPS-tracked walk's id the player picked to refresh — see
  // openspec/changes/home-range/design.md Decision 4 and
  // src/economy/denEconomy.ts's evaluateManualLogQuota/recordManualLogUsage
  // for the exact cap rules this enforces.
  const logMissedWalk = async (timing: MissedWalkTiming, refreshRouteWalkId?: string) => {
    const now = Date.now();
    const startTime = startTimeForMissedWalk(timing, now);

    if (!isWithinManualLogWindow(startTime, now)) {
      Alert.alert('Too far back', 'Missed walks can only be logged from today or yesterday.');
      return;
    }

    const denStateBefore = await denEconomyRepository.getState();
    const quota = evaluateManualLogQuota(denStateBefore, now, !!refreshRouteWalkId);
    if (!quota.allowed) {
      Alert.alert('Already logged today', "You've already logged the most missed walks we allow for one day.");
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

      let bloom = 1;
      let refreshApplied = false;
      if (quota.canRefreshRoute && refreshRouteWalkId) {
        const routeWalk = await walkRepository.getWalk(refreshRouteWalkId);
        // The picker only ever offers the player's own previously-tracked
        // walks (App.tsx's eligibleRefreshRoutes filter), so this should
        // always resolve — defensive null-check only, no user-facing error.
        if (routeWalk) {
          const routeCells = paintedCells(routeWalk.locations);
          if (routeCells.size > 0) {
            await homeRangeRepository.paintCells(
              Array.from(routeCells).map((id) => {
                const { ix, iy } = parseCellKey(id);
                return { ix, iy, refreshedAt: now, tracked: false };
              })
            );
            setHomeRangeRefreshKey((k) => k + 1);
            bloom = manualLogBloomMultiplier();
            refreshApplied = true;
          }
        }
      }

      // Record the manual log (and, if used, the route refresh) before
      // awarding rewards below, so awardWalkRewards's own getState()/
      // saveState() round-trip picks up and preserves this bookkeeping
      // (denEconomy.ts's recordManualLogUsage doc comment explains why the
      // ordering matters).
      await denEconomyRepository.saveState(recordManualLogUsage(denStateBefore, now, refreshApplied));

      const result = await awardWalkRewards(
        manualWalk,
        0,
        0,
        { denEconomyRepository, personalStatsRepository, walkRepository },
        0,
        bloom
      );
      setTreats(result.denEconomyState.treats);
      setLevel(result.denEconomyState.level);
      setShowLogMissedWalk(false);
      setCelebration(result.celebration);

      // Combined second patch write (openspec/changes/walk-portrait/design.md
      // Decision 6): records which route (if any) this manual log refreshed,
      // and its treatsEarned, on the manual log's own stored record — both
      // resolve at this same point, so one saveWalk patch covers both rather
      // than two separate round-trips. Never surfaces as a user-visible
      // error (same rule as finishWalk's own treatsEarned patch above).
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

  const resetWalk = async () => {
    await stopWatchingLocation();
    if (appState.walk) {
      log('WALK_CANCELLED', { id: appState.walk.id, points: appState.walk.locations.length });
    }
    setAppState({
      walk: null,
      isTracking: false,
      error: null,
    });
  };

  const distance = appState.walk ? cumulativeDistance(appState.walk.locations) / 1000 : 0;

  if (needsDogName) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <DogNamePromptScreen onSubmit={submitDogName} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (showDoorstep) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <DoorstepScreen
            dogName={dogName}
            treats={treats ?? 0}
            level={level ?? 1}
            accruedDelta={accruedDelta}
            pendingDenAchievements={pendingDenAchievements}
            showOverflowLine={showOverflowLine}
            previousLastTickAt={previousLastTickAt}
            denEconomyRepository={denEconomyRepository}
            homeRangeRepository={homeRangeRepository}
            walkRepository={walkRepository}
            territoryRepository={territoryRepository}
            justRevealedTerritoryIncome={justRevealedTerritoryIncome}
            territoryIncomeRate={territoryIncomeRate}
            onAcknowledgePendingAchievements={() => setPendingDenAchievements([])}
            onStartWalk={() => {
              setShowDoorstep(false);
              startWalk();
            }}
            onOpenMap={() => setShowDoorstep(false)}
            onOpenDen={() => {
              setShowDoorstep(false);
              setShowDen(true);
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (celebration) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <CelebrationScreen
            cellsPainted={celebration.cellsPainted}
            hasTerritory={celebration.hasTerritory}
            treatsEarned={celebration.treatsEarned}
            tease={celebration.tease}
            unlockedAchievements={celebration.unlockedAchievements}
            leveledUpTo={celebration.leveledUpTo}
            oldTreatsPerWalk={celebration.oldTreatsPerWalk}
            newTreatsPerWalk={celebration.newTreatsPerWalk}
            cliffhangerTitle={celebration.cliffhangerTitle}
            newGroundCellCount={celebration.newGroundCellCount}
            bloomMultiplier={celebration.bloomMultiplier}
            newTerritoryName={territoryBeat?.newTerritoryName ?? null}
            mergedTerritoryNames={territoryBeat?.mergedTerritoryNames ?? null}
            dogName={dogName}
            onContinue={() => {
              setCelebration(null);
              setTerritoryBeat(null);
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (showTerritories) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <TerritoriesScreen
            territoryRepository={territoryRepository}
            homeRangeRepository={homeRangeRepository}
            denEconomyRepository={denEconomyRepository}
            onOpenMap={() => setShowTerritories(false)}
            onClose={() => setShowTerritories(false)}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // Rendered above/instead of the showHistory branch below while a walk is
  // being viewed, with showHistory itself left true underneath (design.md
  // Decision 8) — dismissing the Portrait returns to the still-mounted
  // history list, not the map.
  if (viewingWalk) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <WalkPortraitScreen
            walk={viewingWalk}
            walkRepository={walkRepository}
            homeRangeRepository={homeRangeRepository}
            dogName={dogName}
            onClose={() => setViewingWalk(null)}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (showHistory) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <WalkHistoryScreen
            repository={walkRepository}
            homeRangeRepository={homeRangeRepository}
            onSelectWalk={setViewingWalk}
            onClose={() => {
              setShowHistory(false);
              setHomeRangeRefreshKey((k) => k + 1);
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (showDen) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <DenScreen
            repository={denEconomyRepository}
            personalStatsRepository={personalStatsRepository}
            homeRangeRepository={homeRangeRepository}
            pendingAchievements={pendingDenAchievements}
            onAcknowledgePendingAchievements={() => setPendingDenAchievements([])}
            onClose={() => setShowDen(false)}
            onTreatsChanged={setTreats}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (showDebugLog) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <DebugLogScreen onClose={() => setShowDebugLog(false)} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (showStats) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <StatsScreen
            repository={personalStatsRepository}
            denEconomyRepository={denEconomyRepository}
            onClose={() => setShowStats(false)}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (showLogMissedWalk) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <LogMissedWalkScreen
            onLog={logMissedWalk}
            onClose={() => setShowLogMissedWalk(false)}
            walkRepository={walkRepository}
            routeRefreshAvailable={routeRefreshAvailable}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.container}>
      <StatusBar />

      {/* Map */}
      <View style={styles.map}>
        <MapView
          locations={appState.walk?.locations || []}
          currentLocation={appState.walk?.locations[appState.walk.locations.length - 1]}
          homeRangeRepository={homeRangeRepository}
          isTracking={appState.isTracking}
          homeRangeRefreshKey={homeRangeRefreshKey}
          wildSpot={wildSpot}
          panToSpot={panToSpot}
          onOpenTerritories={() => setShowTerritories(true)}
        />
      </View>

      {/* Bottom controls */}
      <View style={styles.controls}>
        {/* "Somewhere Wild" (openspec/changes/somewhere-wild) — the map
            screen only, never the Den screen (home-range-rewards/design.md's
            FLAG 2) and never a push notification. Renders nothing most of
            the time (see SomewhereWildCard.tsx). */}
        <SomewhereWildCard
          homeRangeRepository={homeRangeRepository}
          walkRepository={walkRepository}
          dogName={dogName}
          territoryRepository={territoryRepository}
          refreshKey={homeRangeRefreshKey}
          onSpotChange={setWildSpot}
          onTapSpot={(spot) => setPanToSpot({ ...spot, requestId: Date.now() })}
        />

        <View style={styles.stats}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>{distance.toFixed(2)} km</Text>

          <Text style={[styles.statLabel, { marginLeft: 20 }]}>Points</Text>
          <Text style={styles.statValue}>{appState.walk?.locations.length || 0}</Text>

          <Text style={[styles.statLabel, { marginLeft: 20 }]}>Treats</Text>
          <Text style={styles.statValue}>{treats !== null ? Math.floor(treats) : '…'}</Text>

          <Text style={[styles.statLabel, { marginLeft: 20 }]}>Level</Text>
          <Text style={styles.statValue}>{level !== null ? `${dogDisplayName(dogName)} — Level ${level}` : '…'}</Text>
        </View>

        <View style={styles.buttons}>
          {!appState.isTracking ? (
            <>
              <TouchableOpacity style={[styles.button, styles.startButton]} onPress={startWalk}>
                <Text style={styles.buttonText}>Start Walk</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.logMissedWalkButton]}
                onPress={() => setShowLogMissedWalk(true)}
              >
                <Text style={styles.buttonText}>Log a walk we missed</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.historyButton]} onPress={() => setShowHistory(true)}>
                <Text style={styles.buttonText}>View Past Walks</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.denButton]} onPress={() => setShowDen(true)}>
                <Text style={styles.buttonText}>The Den</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.statsButton]} onPress={() => setShowStats(true)}>
                <Text style={styles.buttonText}>Stats & Badges</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.debugLogButton]} onPress={() => setShowDebugLog(true)}>
                <Text style={styles.buttonText}>Debug Log</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Two-way terminal action model (design.md's Technical Split
                  Addendum): Finish Walk always saves the trail and paints
                  it into the Home Range, regardless of shape — there's
                  nothing left for a separate loop-closure gate to mean. */}
              <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={finishWalk}>
                <Text style={styles.buttonText}>Finish Walk</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={resetWalk}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {appState.walk && !appState.isTracking && appState.walk.closed && (
            <TouchableOpacity style={[styles.button, styles.newButton]} onPress={resetWalk}>
              <Text style={styles.buttonText}>New Walk</Text>
            </TouchableOpacity>
          )}
        </View>

        {appState.error && <Text style={styles.error}>{appState.error}</Text>}
      </View>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  map: {
    flex: 1,
  },
  controls: {
    paddingBottom: 20,
    paddingHorizontal: 16,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  stats: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '700',
    marginTop: 2,
  },
  buttons: {
    gap: 8,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: COLORS.green,
  },
  logMissedWalkButton: {
    backgroundColor: '#F39C12',
  },
  stopButton: {
    backgroundColor: COLORS.blue,
  },
  historyButton: {
    backgroundColor: COLORS.blue,
  },
  denButton: {
    backgroundColor: '#8B6F47',
  },
  statsButton: {
    backgroundColor: '#3A9E5F',
  },
  debugLogButton: {
    backgroundColor: COLORS.muted,
  },
  cancelButton: {
    backgroundColor: '#E74C3C',
  },
  newButton: {
    backgroundColor: COLORS.green,
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
  },
  error: {
    color: '#E74C3C',
    marginTop: 8,
    fontSize: 12,
  },
});
