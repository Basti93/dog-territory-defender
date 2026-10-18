import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';

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
import {
  AwayStripLine,
  DoorstepScreen,
  DoorstepSession,
  pickGreeting,
  resolveAwayStripLines,
  resolveDoorstepSession,
} from './src/components/DoorstepScreen';
import { CelebrationScreen } from './src/components/CelebrationScreen';
import { DebugLogScreen } from './src/components/DebugLogScreen';
import { StatsScreen } from './src/components/StatsScreen';
import { LogMissedWalkScreen } from './src/components/LogMissedWalkScreen';
import { DogNamePromptScreen } from './src/components/DogNamePromptScreen';
import {
  OnboardingScreen,
  PermissionPrimerScreen,
  resolveFirstLaunchStep,
  shouldRunOnboardingThisLaunch,
} from './src/components/onboarding';
import { createSqliteDenEconomyRepository } from './src/storage/sqliteDenEconomyRepository';
import { createSqlitePersonalStatsRepository } from './src/storage/sqlitePersonalStatsRepository';
import { createSqliteNotificationRepository } from './src/storage/sqliteNotificationRepository';
import { createSqliteBuddyAppearanceRepository } from './src/storage/sqliteBuddyAppearanceRepository';
import { BuddyAppearancePicker } from './src/components/buddy';
import { BuddyMood, resolveBuddyMood } from './src/components/buddy/buddyMood';
import { useBuddyAppearance } from './src/components/useBuddyAppearance';
import { Button, FadeSlideIn, palette, spacing, textStyle, tokens, useAppFonts } from './src/ui';
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
import { checkAndScheduleWalkReminder } from './src/notifications/walkReminder';
import { resolveDoorstepOverflowLine } from './src/notifications/notificationDecision';
import {
  DEN_OVERFLOW_NOTIFICATION_DATA,
  requestNotificationPermission,
  WALK_REMINDER_NOTIFICATION_DATA,
} from './src/notifications/scheduler';
import { SettingsScreen } from './src/components/SettingsScreen';
import { log } from './src/utils/log';
import { createSqliteSettingsRepository } from './src/storage/sqliteSettingsRepository';
import { loadFeedbackPrefsAtStartup } from './src/feedback/feedbackRepository';
import { formatDistanceKm, getDeviceLocale, LocalePreference, resolveLocale, setLocale, t, useLocale } from './src/i18n';

const walkRepository = createSqliteWalkRepository();
const homeRangeRepository = createSqliteHomeRangeRepository();
const territoryRepository = createSqliteTerritoryRepository();
const denEconomyRepository = createSqliteDenEconomyRepository();
const personalStatsRepository = createSqlitePersonalStatsRepository();
const notificationRepository = createSqliteNotificationRepository();
const buddyAppearanceRepository = createSqliteBuddyAppearanceRepository();
const settingsRepository = createSqliteSettingsRepository();
loadFeedbackPrefsAtStartup();

// Loads and applies the saved language as early as possible (module import
// time). Everything that produces copy at launch (greeting, away-strip lines,
// territory names, notifications) awaits this first, and the render gate
// below waits for it too, so no screen ever flashes in the wrong language.
const localePreferenceLoaded: Promise<LocalePreference> = settingsRepository
  .getLocalePreference()
  .catch((): LocalePreference => 'system')
  .then((pref) => {
    setLocale(resolveLocale(pref, getDeviceLocale()));
    return pref;
  });

// Keep the native splash up until the fonts gate opens, so no blank frame flashes.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const { loaded: fontsLoaded } = useAppFonts();
  useLocale(); // re-render every screen when the language switches
  const [localePreference, setLocalePreference] = useState<LocalePreference>('system');
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => {
    localePreferenceLoaded.then((pref) => {
      setLocalePreference(pref);
      setLocaleReady(true);
    });
  }, []);
  useEffect(() => {
    if (fontsLoaded && localeReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, localeReady]);
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
  // Settings (openspec/changes/walk-reminder/design.md Decision 1) — this
  // app's first Settings screen, reached via DoorstepMenu's third row.
  // Mirrors the existing showDebugLog/showLogMissedWalk boolean-toggle
  // convention exactly.
  const [showSettings, setShowSettings] = useState(false);
  // The Doorstep (openspec/changes/home-dashboard) — the app's persistent
  // home/overview screen (design.md Decisions 8-13). Shown at cold start,
  // right after the dog-naming gate, and set back to true by every other
  // screen's dismiss handler below, so it's reachable again after any trip
  // into the Den/History/Stats/map — not a one-time splash.
  const [showDoorstep, setShowDoorstep] = useState(true);
  const [homeRangeRefreshKey, setHomeRangeRefreshKey] = useState(0);
  const [treats, setTreats] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [dogName, setDogName] = useState<string | null>(null);
  // First-launch flow (onboarding cards -> dog name -> look -> permission primer),
  // decided by the pure resolveFirstLaunchStep. `firstLaunchLoaded` flips with
  // dogName in the mount effect below. `onboardingThisLaunch` is true only on a
  // fresh install; it defers the launch-time location request to the primer.
  const [firstLaunchLoaded, setFirstLaunchLoaded] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [onboardingThisLaunch, setOnboardingThisLaunch] = useState(false);
  const [cardsFinished, setCardsFinished] = useState(false);
  const [primerPending, setPrimerPending] = useState(false);
  // Buddy's look (buddy-comes-alive). `choosingLook` is true only right after a
  // brand-new player names their dog; existing players are never gated.
  const { appearance: buddyAppearance, loaded: buddyAppearanceLoaded, saveAppearance } = useBuddyAppearance(buddyAppearanceRepository);
  const [choosingLook, setChoosingLook] = useState(false);
  // The Den shows the "while you were away" treat float-up once per launch.
  const [denAccrualShown, setDenAccrualShown] = useState(false);
  const [pendingDenAchievements, setPendingDenAchievements] = useState<AchievementId[]>([]);
  // Passed down to DoorstepScreen as already-computed values — re-deriving
  // either after this mount effect has already advanced lastTickAt/consumed
  // the achievement queue would silently produce ~0 or an empty queue (see
  // openspec/changes/home-dashboard/design.md Decision 7).
  const [accruedDelta, setAccruedDelta] = useState(0);
  // The Doorstep's session state, greeting copy, and away-strip lines —
  // resolved exactly once per app launch, by the merged mount effect below,
  // and passed straight down to DoorstepScreen as props (design.md Decision
  // 10). Making the Doorstep remountable (Decisions 8-9) means DoorstepScreen
  // itself can no longer safely resolve these on its own mount effect — a
  // later remount (return trip to the Doorstep) would re-derive them from
  // App.tsx's still-nonzero accruedDelta/showOverflowLine state and
  // repeat-fire the same "+N in the bowl" line every time. Resolving here,
  // once, and never touching these again after the initial mount effect
  // finishes, is what prevents that.
  const [doorstepSession, setDoorstepSession] = useState<DoorstepSession | null>(null);
  const [doorstepGreeting, setDoorstepGreeting] = useState<string | null>(null);
  const [awayStripLines, setAwayStripLines] = useState<AwayStripLine[]>([]);
  // Buddy's mood and the one-off long-absence greeting are also once-per-launch
  // (Doorstep remounts on every return trip). `playBuddyGreeting` is cleared
  // when the first Doorstep mount starts the greeting so it never replays.
  const [buddyMood, setBuddyMood] = useState<BuddyMood>('idle');
  const [playBuddyGreeting, setPlayBuddyGreeting] = useState(false);
  const [celebration, setCelebration] = useState<WalkRewardsCelebration | null>(null);
  // Id of the walk behind `celebration`; seeds the celebration headline pick.
  const [celebrationWalkId, setCelebrationWalkId] = useState<string | null>(null);
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
  // in the merged mount effect below and folded into that same effect's
  // resolveAwayStripLines call (openspec/changes/home-dashboard/design.md
  // Decision 10), not passed down to DoorstepScreen directly.
  // territoryIncomeRate is the current global rate, passed straight through
  // to DoorstepScreen for its permanent footer line.
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

  // Initialize location permission. On a fresh install the permission primer
  // asks instead (after the player has been told why), so this waits for the
  // first-launch state and skips that case.
  useEffect(() => {
    if (!firstLaunchLoaded || onboardingThisLaunch) return;
    (async () => {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setAppState((prev) => ({
          ...prev,
          error: t('app.locationDenied'),
        }));
      }
    })();
  }, [firstLaunchLoaded, onboardingThisLaunch]);

  // One-time backfill of every previously saved tracked walk into the Home
  // Range grid, then — only once that's done, since it needs a populated
  // Range to cluster (openspec/changes/territories/tasks.md task 3.3) — the
  // one-time Territory partition backfill. Both are idempotent (guarded by
  // their own DenEconomyState flags), safe to call on every app load. See
  // storage/homeRangeMigration.ts / storage/territoryMigration.ts.
  useEffect(() => {
    localePreferenceLoaded
      .then(() => runHomeRangeMigrationIfNeeded({ walkRepository, homeRangeRepository, denEconomyRepository }))
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
      const type = response.notification.request.content.data?.type;
      if (type === DEN_OVERFLOW_NOTIFICATION_DATA.type) {
        // design.md Decision 11: showDoorstep defaults to true, and its `if`
        // branch is checked first in the screen chain below — without also
        // clearing it here, a cold start triggered by tapping this
        // notification would silently land on the Doorstep instead of Den,
        // with no indication the tap did anything. Same one-line pattern
        // every other onOpenX handler in this file already applies.
        setShowDoorstep(false);
        setShowDen(true);
      } else if (type === WALK_REMINDER_NOTIFICATION_DATA.type) {
        // openspec/changes/walk-reminder/design.md Decision 9: the Doorstep,
        // not the Den, is this reminder's destination — its Start Walk
        // button is the actual behavior the reminder exists to prompt.
        // showDoorstep already defaults to true, but this closes any other
        // screen state a tap might otherwise land underneath.
        setShowDen(false);
        setShowDoorstep(true);
      }
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      const type = response?.notification.request.content.data?.type;
      if (type === DEN_OVERFLOW_NOTIFICATION_DATA.type) {
        setShowDoorstep(false);
        setShowDen(true);
      } else if (type === WALK_REMINDER_NOTIFICATION_DATA.type) {
        setShowDen(false);
        setShowDoorstep(true);
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
      await localePreferenceLoaded; // copy below (greeting, strip lines, alerts) must use the saved language
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
      // Read before the setState batch below so loaded + dogName flip together.
      const onboardingDoneSaved = await settingsRepository.getOnboardingDone().catch(() => false);
      setTreats(reconciled.treats);
      setLevel(reconciled.level);
      setDogName(reconciled.dogName);
      setOnboardingDone(onboardingDoneSaved);
      setOnboardingThisLaunch(shouldRunOnboardingThisLaunch(reconciled.dogName, onboardingDoneSaved));
      setFirstLaunchLoaded(true);

      if (caughtUpToLevel !== null) {
        log('LEVEL_CURVE_CATCH_UP', { before: state.level, caughtUpToLevel });
        // Accepted verbatim copy shape (openspec/changes/virtual-dog-companion) —
        // distinct from the normal per-walk level-up beat, since no walk
        // earned this jump (a curve retune did). See design.md task 7.2/7.3.
        Alert.alert(t('app.caughtUp', { dog: dogDisplayName(reconciled.dogName), level: caughtUpToLevel }));
      }

      const delta = accrued.treats - state.treats;
      setAccruedDelta(delta);

      // openspec/changes/territories/design.md Decision 6: the reveal flag
      // flips at most once, ever — this is true only on the specific open
      // where that flip just happened.
      const justRevealedTerritoryIncomeNow = !state.territoryIncomeRevealed && reconciled.territoryIncomeRevealed;
      setJustRevealedTerritoryIncome(justRevealedTerritoryIncomeNow);
      const territoryIncomeRateNow = territoryRate(territoryMass(worldMass.cellCount, worldMass.visitsSum), reconciled.level);
      setTerritoryIncomeRate(territoryIncomeRateNow);
      let pendingAchievementsForDoorstep: AchievementId[] = [];
      if (delta > 0) {
        const personalStats = await personalStatsRepository.getState();
        const { stats: nextPersonalStats, newlyUnlocked } = recordTreatsEarned(personalStats, delta);
        await personalStatsRepository.saveState(nextPersonalStats);
        if (newlyUnlocked.length > 0) {
          await personalStatsRepository.unlockAchievements(newlyUnlocked, Date.now());
          setPendingDenAchievements(newlyUnlocked);
          pendingAchievementsForDoorstep = newlyUnlocked;
        }
      }

      const bookkeeping = await notificationRepository.getState();
      const { showLine, nextBookkeeping } = resolveDoorstepOverflowLine(reconciled, bookkeeping);
      if (nextBookkeeping !== bookkeeping) {
        await notificationRepository.saveState(nextBookkeeping);
      }

      // Recompute/reschedule the earned-trigger notification each time the
      // app opens (see openspec/changes/walk-start-notifications/design.md's
      // accepted check cadence — there's no backend to wake the app while
      // it's closed). Sequenced after the overflow-line claim above.
      await checkAndScheduleEarnedTriggerNotification({ denEconomyRepository, walkRepository, notificationRepository }).catch(
        (err) => log('NOTIFICATION_CHECK_ERROR', { error: String(err) })
      );

      // The opt-in daily walk reminder (openspec/changes/walk-reminder/
      // design.md Decision 4) — recomputed/rescheduled here on every app
      // open, and again right after a tracked walk finishes or a walk is
      // manually logged (see finishWalk/logMissedWalk below).
      await checkAndScheduleWalkReminder({ walkRepository, notificationRepository }).catch((err) =>
        log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
      );

      // Resolve the Doorstep's session state, greeting, and away-strip lines
      // exactly once here — the last step, once every input they depend on
      // (accruedDelta, pendingDenAchievements, the overflow-line claim
      // above) is already final. Per design.md Decision 10, this used to run
      // inside DoorstepScreen's own mount effect, but making the Doorstep
      // remountable (Decisions 8-9) means that effect would re-run — and
      // repeat-fire the same "+N in the bowl"/achievement/overflow line — on
      // every later return trip to the Doorstep this session. Resolving here
      // instead, in this once-per-launch effect, and passing the results
      // down as plain props, is what prevents that.
      const doorstepNow = Date.now();
      const resolvedSession = resolveDoorstepSession(previousTick, doorstepNow);
      const resolvedGreeting = resolvedSession.greetingFlavor
        ? pickGreeting(resolvedSession.greetingFlavor, reconciled.dogName)
        : null;
      const resolvedAwayStripLines = await resolveAwayStripLines(
        {
          somewhereWildDeps: {
            homeRangeRepository,
            walkRepository,
            dogName: reconciled.dogName,
            now: doorstepNow,
            territoryRepository,
          },
          pendingDenAchievements: pendingAchievementsForDoorstep,
          accruedDelta: delta,
          showOverflowLine: showLine,
          treats: reconciled.treats,
          justRevealedTerritoryIncome: justRevealedTerritoryIncomeNow,
          territoryIncomeRate: territoryIncomeRateNow,
        },
        resolvedSession.kind
      );
      const resolvedMood = resolveBuddyMood({
        sessionKind: resolvedSession.kind,
        greetingFlavor: resolvedSession.greetingFlavor,
        hour: new Date(doorstepNow).getHours(),
        curious: resolvedAwayStripLines.some((l) => l.kind === 'somewhere-wild'),
      });
      // Set together, after the await, so the Doorstep never mounts "resolved"
      // with empty strip lines (which would bake curious=false).
      setAwayStripLines(resolvedAwayStripLines);
      setDoorstepGreeting(resolvedGreeting);
      setBuddyMood(resolvedMood.mood);
      setPlayBuddyGreeting(resolvedMood.playGreeting);
      setDoorstepSession(resolvedSession);
    })();
  }, []);

  const submitDogName = async (name: string) => {
    const state = await denEconomyRepository.getState();
    const next = { ...state, dogName: name };
    await denEconomyRepository.saveState(next);
    setDogName(name);
    setChoosingLook(true);
  };

  // Look picker finished or skipped: fresh installs continue to the permission
  // primer, existing players go straight on.
  const finishLookStep = () => {
    setChoosingLook(false);
    if (onboardingThisLaunch) setPrimerPending(true);
  };

  const finishPrimer = () => {
    setPrimerPending(false);
    setOnboardingDone(true);
    settingsRepository.saveOnboardingDone(true).catch((err) => log('SETTINGS_ONBOARDING_SAVE_ERROR', { error: String(err) }));
  };

  const primerRequestLocation = async () => {
    const granted = await requestLocationPermission();
    if (!granted) setAppState((prev) => ({ ...prev, error: t('app.locationDenied') }));
    return granted;
  };

  const startWalk = async () => {
    let initialLoc = await getInitialLocation();
    if (!initialLoc) {
      // Permission may simply not have been granted yet: ask once, then retry.
      await requestLocationPermission();
      initialLoc = await getInitialLocation();
    }
    if (!initialLoc) {
      Alert.alert(t('app.errorTitle'), t('app.noInitialLocation'));
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

    // Replan reminders so one doesn't fire mid-walk (the walk isn't in the
    // repository until it finishes, so pass it in explicitly).
    checkAndScheduleWalkReminder({ walkRepository, notificationRepository }, Date.now(), [newWalk]).catch((err) =>
      log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
    );

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
      // openspec/changes/walk-reminder/design.md Decision 4: recheck right
      // after a tracked walk finishes, not just at the next app open — a
      // walk that finishes mid-afternoon should cancel a reminder already
      // scheduled for later that same evening.
      await checkAndScheduleWalkReminder({ walkRepository, notificationRepository }).catch((err) =>
        log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
      );
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
      setCelebrationWalkId(walk.id);
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
      // openspec/changes/walk-reminder/design.md Decision 4: recheck right
      // after a walk is manually logged, same gap-closing rationale as
      // finishWalk's own recheck above.
      await checkAndScheduleWalkReminder({ walkRepository, notificationRepository }).catch((err) =>
        log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
      );

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
      // design.md Decision 8's table: every dismiss of Log a Missed Walk
      // returns to the Doorstep. Safe to set here even though celebration is
      // about to render on top of it (see the celebration-vs-showDoorstep
      // reordering note at the celebration screen check below) — the player
      // lands on the Doorstep once they dismiss the celebration.
      setShowDoorstep(true);
      setCelebrationWalkId(manualWalk.id);
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

  const changeLocalePreference = async (pref: LocalePreference) => {
    setLocalePreference(pref);
    setLocale(resolveLocale(pref, getDeviceLocale()));
    try {
      await settingsRepository.saveLocalePreference(pref);
    } catch (err) {
      log('SETTINGS_LOCALE_SAVE_ERROR', { error: String(err) });
    }
    // Re-plan so already-scheduled reminders pick up the new language.
    await checkAndScheduleWalkReminder({ walkRepository, notificationRepository }).catch((err) =>
      log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
    );
  };

  const distance = appState.walk ? cumulativeDistance(appState.walk.locations) / 1000 : 0;

  // Fonts + language gate: first render waits so no screen flashes the system
  // font or the wrong language.
  if (!fontsLoaded || !localeReady) return null;

  const firstLaunchStep = resolveFirstLaunchStep({
    loaded: firstLaunchLoaded,
    dogName,
    onboardingDone,
    cardsFinished,
    choosingLook,
    primerPending,
  });

  // Cream loading view until Den state + settings are read, so no screen flashes first.
  if (firstLaunchStep === 'loading') {
    return <View style={styles.container} />;
  }

  if (firstLaunchStep === 'onboarding') {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <FadeSlideIn key="onboarding">
            <OnboardingScreen buddyAppearance={buddyAppearance} onDone={() => setCardsFinished(true)} />
          </FadeSlideIn>
        </View>
      </SafeAreaProvider>
    );
  }

  if (firstLaunchStep === 'dogName') {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <FadeSlideIn key="dog-name">
            <DogNamePromptScreen onSubmit={submitDogName} buddyAppearance={buddyAppearance} />
          </FadeSlideIn>
        </View>
      </SafeAreaProvider>
    );
  }

  if (firstLaunchStep === 'look') {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <FadeSlideIn key="buddy-look">
            <BuddyAppearancePicker
              name={dogDisplayName(dogName)}
              initial={buddyAppearance}
              topInset={16} // inside SafeAreaView already; just a little breathing room
              onSave={(look) => {
                saveAppearance(look);
                finishLookStep();
              }}
              // Skipping keeps the default look, saved so the picker never reappears.
              onSkip={() => {
                saveAppearance(buddyAppearance);
                finishLookStep();
              }}
            />
          </FadeSlideIn>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (firstLaunchStep === 'primer') {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <FadeSlideIn key="permission-primer">
            <PermissionPrimerScreen
              buddyAppearance={buddyAppearance}
              onRequestLocation={primerRequestLocation}
              onRequestReminders={requestNotificationPermission}
              onDone={finishPrimer}
            />
          </FadeSlideIn>
        </View>
      </SafeAreaProvider>
    );
  }

  // Checked BEFORE showDoorstep (design.md Decisions 8/9's own reordering
  // consequence, not covered explicitly by tasks.md but required to
  // implement them without a regression): logMissedWalk's success path
  // (below) sets both showLogMissedWalk=false and showDoorstep=true in the
  // same synchronous call as setCelebration(...), so celebration and
  // showDoorstep can now legitimately both be true at once — something that
  // was structurally impossible before the Doorstep became remountable
  // (showDoorstep only ever went true->false, never back). Celebration is a
  // one-off reward moment, not part of the persistent-home-screen navigation
  // model, so it should always win that race and render on top; the player
  // lands on the (already-set) Doorstep once they dismiss it via "Nice
  // walk!" — closing the same "no way back" gap for the manual-log flow
  // that Decision 8 closes for every other screen.
  if (celebration) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <FadeSlideIn key="celebration">
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
              buddyAppearance={buddyAppearance}
              walkId={celebrationWalkId}
              onContinue={() => {
                setCelebration(null);
                setTerritoryBeat(null);
              }}
            />
          </FadeSlideIn>
        </View>
      </SafeAreaProvider>
    );
  }

  if (showDoorstep) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          {/* FadeSlideIn rule: Android WebViews inside an animating-opacity parent can
              render blank. Never wrap a screen that hosts a WebView (MapView,
              WalkPortraitScreen, Doorstep/Territories via TerritoryPortrait) in
              FadeSlideIn. DoorstepScreen fades only its non-portrait children itself. */}
            <DoorstepScreen
              dogName={dogName}
              treats={treats ?? 0}
              level={level ?? 1}
              accruedDelta={accruedDelta}
              pendingDenAchievements={pendingDenAchievements}
              session={doorstepSession}
              greeting={doorstepGreeting}
              awayStripLines={awayStripLines}
              denEconomyRepository={denEconomyRepository}
              homeRangeRepository={homeRangeRepository}
              walkRepository={walkRepository}
              buddyAppearance={buddyAppearance}
              buddyAppearanceLoaded={buddyAppearanceLoaded}
              buddyMood={buddyMood}
              playGreeting={playBuddyGreeting}
              onBuddyGreetingStarted={() => setPlayBuddyGreeting(false)}
              territoryRepository={territoryRepository}
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
              onOpenHistory={() => {
                setShowDoorstep(false);
                setShowHistory(true);
              }}
              onOpenStats={() => {
                setShowDoorstep(false);
                setShowStats(true);
              }}
              onOpenDebugLog={() => {
                setShowDoorstep(false);
                setShowDebugLog(true);
              }}
              onOpenLogMissedWalk={() => {
                setShowDoorstep(false);
                setShowLogMissedWalk(true);
              }}
              onOpenSettings={() => {
                setShowDoorstep(false);
                setShowSettings(true);
              }}
            />
        </View>
      </SafeAreaProvider>
    );
  }

  if (showTerritories) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
            <TerritoriesScreen
              buddyAppearance={buddyAppearance}
              territoryRepository={territoryRepository}
              homeRangeRepository={homeRangeRepository}
              denEconomyRepository={denEconomyRepository}
              onOpenMap={() => setShowTerritories(false)}
              onClose={() => setShowTerritories(false)}
            />
        </View>
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
        <View style={styles.container}>
            <WalkPortraitScreen
              walk={viewingWalk}
              walkRepository={walkRepository}
              homeRangeRepository={homeRangeRepository}
              dogName={dogName}
              onClose={() => setViewingWalk(null)}
            />
        </View>
      </SafeAreaProvider>
    );
  }

  if (showHistory) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <FadeSlideIn key="history">
            <WalkHistoryScreen
              buddyAppearance={buddyAppearance}
              repository={walkRepository}
              homeRangeRepository={homeRangeRepository}
              onSelectWalk={setViewingWalk}
              onClose={() => {
                setShowHistory(false);
                setHomeRangeRefreshKey((k) => k + 1);
                setShowDoorstep(true);
              }}
            />
          </FadeSlideIn>
        </View>
      </SafeAreaProvider>
    );
  }

  if (showDen) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <FadeSlideIn key="den">
            <DenScreen
              repository={denEconomyRepository}
              personalStatsRepository={personalStatsRepository}
              homeRangeRepository={homeRangeRepository}
              buddyAppearance={buddyAppearance}
              accruedSinceLastVisit={denAccrualShown ? 0 : accruedDelta}
              onAccrualShown={() => setDenAccrualShown(true)}
              pendingAchievements={pendingDenAchievements}
              onAcknowledgePendingAchievements={() => setPendingDenAchievements([])}
              onClose={() => {
                setShowDen(false);
                setShowDoorstep(true);
              }}
              onTreatsChanged={setTreats}
            />
          </FadeSlideIn>
        </View>
      </SafeAreaProvider>
    );
  }

  if (showDebugLog) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <FadeSlideIn key="debug-log">
            <DebugLogScreen
              notificationRepository={notificationRepository}
              onClose={() => {
                setShowDebugLog(false);
                setShowDoorstep(true);
              }}
            />
          </FadeSlideIn>
        </View>
      </SafeAreaProvider>
    );
  }

  if (showSettings) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <FadeSlideIn key="settings">
            <SettingsScreen
              notificationRepository={notificationRepository}
              walkRepository={walkRepository}
              dogName={dogName}
              buddyAppearance={buddyAppearance}
              onSaveAppearance={saveAppearance}
              localePreference={localePreference}
              onChangeLocalePreference={changeLocalePreference}
              onClose={() => {
                setShowSettings(false);
                setShowDoorstep(true);
              }}
            />
          </FadeSlideIn>
        </View>
      </SafeAreaProvider>
    );
  }

  if (showStats) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <FadeSlideIn key="stats">
            <StatsScreen
              buddyAppearance={buddyAppearance}
              repository={personalStatsRepository}
              denEconomyRepository={denEconomyRepository}
              onClose={() => {
                setShowStats(false);
                setShowDoorstep(true);
              }}
            />
          </FadeSlideIn>
        </View>
      </SafeAreaProvider>
    );
  }

  if (showLogMissedWalk) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <FadeSlideIn key="log-missed-walk">
            <LogMissedWalkScreen
              onLog={logMissedWalk}
              onClose={() => {
                setShowLogMissedWalk(false);
                setShowDoorstep(true);
              }}
              walkRepository={walkRepository}
              routeRefreshAvailable={routeRefreshAvailable}
            />
          </FadeSlideIn>
        </View>
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
          <Text style={[textStyle('min'), styles.statLabel]}>{t('app.distance')}</Text>
          <Text style={textStyle('body')}>{formatDistanceKm(distance)}</Text>

          <Text style={[textStyle('min'), styles.statLabel]}>{t('app.points')}</Text>
          <Text style={textStyle('body')}>{appState.walk?.locations.length || 0}</Text>

          <Text style={[textStyle('min'), styles.statLabel]}>{t('den.treats')}</Text>
          <Text style={textStyle('body')}>{treats !== null ? Math.floor(treats) : '…'}</Text>

          <Text style={[textStyle('min'), styles.statLabel]}>{t('stats.level')}</Text>
          <Text style={textStyle('body')}>{level !== null ? t('den.dogLevel', { dog: dogDisplayName(dogName), level }) : '…'}</Text>
        </View>

        <View style={styles.buttons}>
          {!appState.isTracking ? (
            // The idle map screen's own button stack (Start Walk / Log a
            // walk we missed / View Past Walks / The Den / Stats & Badges /
            // Debug Log) is removed (design.md Decision 9) — Start Walk now
            // lives one tap away on the Doorstep, and the rest moved to the
            // Doorstep's direct-access row or burger menu. All that's left
            // here is a way back to the Doorstep itself.
            <Button label={t('app.backToDoorstep')} variant="secondary" onPress={() => setShowDoorstep(true)} />
          ) : (
            <>
              {/* Two-way terminal action model (design.md's Technical Split
                  Addendum): Finish Walk always saves the trail and paints
                  it into the Home Range, regardless of shape — there's
                  nothing left for a separate loop-closure gate to mean.
                  Never dismissible to the Doorstep while tracking — an
                  explicit non-goal (design.md Decisions 8-13's own framing:
                  "the live map + Finish Walk/Cancel screen... is never
                  interrupted by or dismissible to the Doorstep"). */}
              <Button label={t('app.finishWalk')} onPress={finishWalk} />
              <Button label={t('common.cancel')} variant="secondary" labelColor={tokens.warm} onPress={resetWalk} />
            </>
          )}

          {appState.walk && !appState.isTracking && appState.walk.closed && (
            <Button
              label={t('app.newWalk')}
              onPress={() => {
                resetWalk();
                // Once the idle screen's own Start Walk button is gone
                // (Decision 9), a player tapping "New Walk" would otherwise
                // land on a now action-less idle map — returning to the
                // Doorstep directly closes that gap (design.md Decision 8's
                // "why New Walk also returns to the Doorstep").
                setShowDoorstep(true);
              }}
            />
          )}
        </View>

        {appState.error && <Text style={[textStyle('min'), styles.error]}>{appState.error}</Text>}
      </View>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  map: {
    flex: 1,
  },
  // No bottom padding: SafeAreaView already adds the bottom inset.
  controls: {
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.background,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
  },
  statLabel: {
    color: palette.muted,
  },
  buttons: {
    gap: spacing.sm,
  },
  error: {
    color: tokens.warm,
    marginTop: spacing.sm,
  },
});
