import { useEffect, useState } from 'react';
import { Alert, InteractionManager } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  AwayStripLine,
  DoorstepSession,
  pickGreeting,
  resolveAwayStripLines,
  resolveDoorstepSession,
} from '../components/doorstepSession';
import { BuddyMood, resolveBuddyMood } from '../components/buddy/buddyMood';
import { applyPassiveAccrual, dogDisplayName, reconcileBuddyLevelCatchUp } from '../economy/denEconomy';
import { territoryMass, territoryRate } from '../economy/territoryEconomy';
import { AchievementId } from '../economy/personalStats';
import { checkAndScheduleEarnedTriggerNotification } from '../notifications/earnedTrigger';
import { checkAndScheduleWalkReminder } from '../notifications/walkReminder';
import { resolveDoorstepOverflowLine } from '../notifications/notificationDecision';
import { DEN_OVERFLOW_NOTIFICATION_DATA, WALK_ENDED_NOTIFICATION_DATA, WALK_REMINDER_NOTIFICATION_DATA } from '../notifications/scheduler';
import { log } from '../utils/log';
import { withTimeout } from '../utils/withTimeout';
import { t } from '../i18n';
import { updateCorners } from './updateCorners';
import { AppRepositories, localePreferenceLoaded, runStartupMigrations } from './repositories';

/** Where a tapped notification sends the player. Pure so it can be tested. */
export function destinationForNotificationType(type: unknown): 'den' | 'doorstep' | null {
  if (type === DEN_OVERFLOW_NOTIFICATION_DATA.type) return 'den';
  // walk-reminder design.md Decision 9: the Doorstep, not the Den, is this
  // reminder's destination — its Start Walk button is what the reminder prompts.
  if (type === WALK_REMINDER_NOTIFICATION_DATA.type) return 'doorstep';
  // Auto-finished walk: the Homecoming plays over the scene (celebration state is already set).
  if (type === WALK_ENDED_NOTIFICATION_DATA.type) return 'doorstep';
  return null;
}

/** Each storage read the first screen depends on must answer within this, or the launch counts as failed. */
export const STARTUP_DB_STEP_TIMEOUT_MS = 20_000;
const startupRead = <T,>(promise: Promise<T>, what: string): Promise<T> => withTimeout(promise, STARTUP_DB_STEP_TIMEOUT_MS, what);

export interface LaunchEffectsDeps {
  repos: AppRepositories;
  /** First-launch state read from storage (dog name + onboarding flag). */
  applyFirstLaunch: (saved: { dogName: string | null; onboardingDone: boolean }) => void;
  setTreats: (treats: number) => void;
  setPile: (pile: number) => void;
  setLevel: (level: number) => void;
  openDen: () => void;
  openDoorstep: () => void;
  /** Bumps the idle map's Home Range render key. */
  onRangeChanged: () => void;
  /**
   * The saved game could not be read (storage wedged, timed out, failed) before the first screen. The app must not stay
   * on a blank view: the caller shows a calm retry screen. Nothing is written to storage in that case.
   */
  onStartupTrouble?: (error: unknown) => void;
  /** Household sync at app open, bounded so a slow server never holds the Doorstep up. Optional: omitted = no sync. */
  syncOnLaunch?: () => Promise<void>;
  /** Worded household news for the Doorstep away strip (multiplayer-sync Decision 10). */
  loadHouseholdLines?: (dogName: string | null) => Promise<string[]>;
}

/**
 * Everything that runs once per app launch. Effect order matters and mirrors
 * the old App.tsx: migrations, notification-tap listeners, then the merged
 * accrual/Doorstep/notification-scheduling routine.
 */
export function useLaunchEffects(deps: LaunchEffectsDeps) {
  const { repos } = deps;
  const { denEconomyRepository, homeRangeRepository, personalStatsRepository, notificationRepository, settingsRepository, walkRepository, territoryRepository } =
    repos;

  // Passed down to the WorldScene as already-computed values — re-deriving
  // either after the launch routine has already advanced lastTickAt/consumed
  // the achievement queue would silently produce ~0 or an empty queue (see
  // docs/decisions/home-dashboard.md Decision 7).
  const [accruedDelta, setAccruedDelta] = useState(0);
  const [pendingDenAchievements, setPendingDenAchievements] = useState<AchievementId[]>([]);
  // The Doorstep's session state, greeting copy, and away-strip lines —
  // resolved exactly once per app launch (home-dashboard design.md Decision
  // 10) and passed to the WorldScene as props. The Doorstep is remountable, so
  // it must not re-derive these on its own mount or it would repeat-fire the
  // same "+N in the bowl" line on every return trip.
  const [doorstepSession, setDoorstepSession] = useState<DoorstepSession | null>(null);
  const [doorstepGreeting, setDoorstepGreeting] = useState<string | null>(null);
  const [awayStripLines, setAwayStripLines] = useState<AwayStripLine[]>([]);
  // Buddy's mood and the one-off long-absence greeting are also once-per-launch.
  // `playBuddyGreeting` is cleared when the first Doorstep mount starts the
  // greeting so it never replays.
  const [buddyMood, setBuddyMood] = useState<BuddyMood>('idle');
  const [playBuddyGreeting, setPlayBuddyGreeting] = useState(false);
  // Current global territory income rate, for the Doorstep's permanent footer line.
  const [territoryIncomeRate, setTerritoryIncomeRate] = useState(0);

  // Migrations (idempotent, safe on every load). Waits for the saved language
  // because territory names are produced in it.
  useEffect(() => {
    localePreferenceLoaded
      .then(() => runStartupMigrations(repos))
      .then(() => deps.onRangeChanged())
      .catch((err) => log('HOME_RANGE_MIGRATION_ERROR', { error: String(err) }))
      // "Unsere Ecken": corners the walks so far already make (the first launch with the feature, or walks that arrived
      // while the app was closed) appear quietly; only a walk that completes one while it is finished asks for a name.
      // Replaying every walk is JS-thread work and the street lookup can take a moment (or fail offline): so it runs
      // after the first screens have settled and never holds up the Home Range refresh above.
      .then(() => new Promise<void>((resolve) => InteractionManager.runAfterInteractions(() => resolve())))
      .then(() => updateCorners({ walkRepository: repos.walkRepository, cornerRepository: repos.cornerRepository, lookupWaitMs: 1500 }))
      .then((found) => {
        if (found.length > 0) deps.onRangeChanged();
      })
      .catch((err) => log('CORNERS_LAUNCH_ERROR', { error: String(err) }));
  }, []);

  // Tapping a notification navigates — both for a response received while the
  // app is running/backgrounded, and for a cold start launched by the tap.
  // Navigation lands on a single screen, so no extra "clear the Doorstep flag"
  // dance is needed (old App.tsx, home-dashboard design.md Decision 11).
  useEffect(() => {
    const go = (type: unknown) => {
      const destination = destinationForNotificationType(type);
      if (destination === 'den') deps.openDen();
      else if (destination === 'doorstep') deps.openDoorstep();
    };
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      go(response.notification.request.content.data?.type);
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      go(response?.notification.request.content.data?.type);
    });
    return () => subscription.remove();
  }, []);

  // Apply passive treat accrual since last open, reconcile Buddy's Level
  // against the current xpGrowth curve (reconcileBuddyLevelCatchUp's doc
  // comment explains why this can lag), then resolve the Doorstep's own
  // overflow-line claim and only then check the earned-trigger notification.
  //
  // home-dashboard design.md Decision 6: one sequential routine, so the
  // Doorstep-facing overflow-line resolution (including its
  // notificationRepository.saveState write) always completes BEFORE
  // checkAndScheduleEarnedTriggerNotification runs and the two channels never
  // both surface the same unclaimed overflow in one app-open.
  useEffect(() => {
    let firstLaunchApplied = false;
    (async () => {
      await localePreferenceLoaded; // copy below (greeting, strip lines, alerts) must use the saved language
      const state = await startupRead(denEconomyRepository.getState(), 'den state');
      const previousTick = state.lastTickAt;
      // worldMass (territories design.md Decision 6) is a single ungrouped
      // aggregate over the whole cells table, independent of territory
      // migration status — safe to read before the migration has run.
      const worldMass = await startupRead(homeRangeRepository.getWorldMass(), 'world mass');
      const accrued = applyPassiveAccrual(state, Date.now(), worldMass);
      const { state: reconciled, caughtUpToLevel } = reconcileBuddyLevelCatchUp(accrued);
      // A write that fails (database busy) must not block the first screen: the accrual is simply applied again next launch.
      await startupRead(denEconomyRepository.saveState(reconciled), 'den state save').catch((err) =>
        log('TREATS_ACCRUAL_SAVE_ERROR', { error: String(err) })
      );
      log('TREATS_PASSIVE_ACCRUAL', {
        before: state.treats + state.pile,
        after: accrued.treats + accrued.pile,
        elapsedHours: (Date.now() - state.lastTickAt) / (1000 * 60 * 60),
      });
      // Read before the setState batch below so loaded + dogName flip together.
      const onboardingDoneSaved = await startupRead(settingsRepository.getOnboardingDone(), 'onboarding flag').catch(() => false);
      deps.setTreats(reconciled.treats);
      deps.setPile(reconciled.pile);
      deps.setLevel(reconciled.level);
      firstLaunchApplied = true;
      deps.applyFirstLaunch({ dogName: reconciled.dogName, onboardingDone: onboardingDoneSaved });

      if (caughtUpToLevel !== null) {
        log('LEVEL_CURVE_CATCH_UP', { before: state.level, caughtUpToLevel });
        // Accepted verbatim copy shape (virtual-dog-companion) — distinct from
        // the per-walk level-up beat, since no walk earned this jump (a curve
        // retune did).
        Alert.alert(t('app.caughtUp', { dog: dogDisplayName(reconciled.dogName), level: caughtUpToLevel }));
      }

      // What the bakery baked while the app was closed lands in the pile; it counts as earned once harvested (useDen.handleHarvest).
      const delta = accrued.pile - state.pile;
      setAccruedDelta(delta);

      // territories design.md Decision 6: the reveal flag flips at most once,
      // ever — true only on the open where that flip just happened.
      const justRevealedTerritoryIncomeNow = !state.territoryIncomeRevealed && reconciled.territoryIncomeRevealed;
      const territoryIncomeRateNow = territoryRate(territoryMass(worldMass.cellCount, worldMass.visitsSum), reconciled.level);
      setTerritoryIncomeRate(territoryIncomeRateNow);
      const pendingAchievementsForDoorstep: AchievementId[] = [];

      const bookkeeping = await notificationRepository.getState();
      const { showLine, nextBookkeeping } = resolveDoorstepOverflowLine(reconciled, bookkeeping);
      if (nextBookkeeping !== bookkeeping) {
        await notificationRepository.saveState(nextBookkeeping);
      }

      // Recompute/reschedule the earned-trigger notification each time the app
      // opens (walk-start-notifications design.md: no backend to wake the app
      // while closed). Sequenced after the overflow-line claim above.
      await checkAndScheduleEarnedTriggerNotification({ denEconomyRepository, walkRepository, notificationRepository }).catch((err) =>
        log('NOTIFICATION_CHECK_ERROR', { error: String(err) })
      );

      // The opt-in daily walk reminder (walk-reminder design.md Decision 4) —
      // rescheduled on every app open, and after a tracked/manual walk.
      await checkAndScheduleWalkReminder({ walkRepository, notificationRepository }).catch((err) =>
        log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
      );

      // Resolve the Doorstep's session state, greeting, and away-strip lines
      // exactly once, as the last step, once every input is final.
      await deps.syncOnLaunch?.().catch((err) => log('SYNC_LAUNCH_ERROR', { error: String(err) }));
      const householdLines = (await deps.loadHouseholdLines?.(reconciled.dogName).catch(() => [] as string[])) ?? [];
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
          householdLines,
          showOverflowLine: showLine,
          treats: reconciled.treats + reconciled.pile,
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
    })().catch((error) => {
      log('LAUNCH_ROUTINE_ERROR', { error: String(error), firstLaunchApplied });
      if (!firstLaunchApplied) deps.onStartupTrouble?.(error);
    });
  }, []);

  return {
    accruedDelta,
    pendingDenAchievements,
    clearPendingDenAchievements: () => setPendingDenAchievements([]),
    doorstepSession,
    doorstepGreeting,
    awayStripLines,
    buddyMood,
    playBuddyGreeting,
    onBuddyGreetingStarted: () => setPlayBuddyGreeting(false),
    territoryIncomeRate,
  };
}
