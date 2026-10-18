import React, { useState } from 'react';
import { Alert } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { t } from './src/i18n';


import { repos } from './src/app/repositories';
import { loadHouseholdLines, onPartnerWalks, partnerHomecoming, presenceSender, presenceViewer, syncEngine, syncOnLaunch } from './src/app/syncRuntime';
import { useSync } from './src/sync/useSync';
import { usePresenceViewer } from './src/sync/usePresenceViewer';
import { usePartnerHomecoming } from './src/sync/usePartnerHomecoming';
import { useLiveSharePrompt } from './src/sync/useLiveSharePrompt';
import { LiveSharePrompt } from './src/components/LiveSharePrompt';
import { screenKey, useNavigation } from './src/app/navigation';
import { useWalkSession } from './src/app/useWalkSession';
import { useWalkRestore } from './src/app/useWalkRestore';
import { activeWalkRecorder } from './src/app/activeWalkRuntime';
import { useCelebration } from './src/app/useCelebration';
import { useFirstLaunch } from './src/app/useFirstLaunch';
import { useLaunchEffects } from './src/app/useLaunchEffects';
import { useManualWalkLog } from './src/app/useManualWalkLog';
import { useAppReady } from './src/app/useAppReady';
import { useOtaUpdates } from './src/app/useOtaUpdates';
import { LoadingView, ScreenFrame } from './src/app/ScreenFrame';
import { resolveAppBack, runBackActions, useBackAction, useHardwareBack } from './src/app/backStack';
import { EdgeSwipeBack } from './src/app/EdgeSwipeBack';
import { MapScreen } from './src/app/MapScreen';
import { SomewhereWildSpot } from './src/components/SomewhereWildCard';
import { TerritoriesScreen } from './src/components/TerritoriesScreen';
import { WalkHistoryScreen } from './src/components/WalkHistoryScreen';
import { WalkPortraitScreen } from './src/components/WalkPortraitScreen';
import { isWeekend, queueWalkTrigger } from './src/components/den/wildExtras';
import { WorldScene } from './src/components/world/WorldScene';
import { partnerHomecomingWalk, type HomecomingWalk } from './src/components/world/homecomingPlan';
import { DebugLogScreen } from './src/components/DebugLogScreen';
import { StatsScreen } from './src/components/StatsScreen';
import { LogMissedWalkScreen } from './src/components/LogMissedWalkScreen';
import { DogNamePromptScreen } from './src/components/DogNamePromptScreen';
import { OnboardingScreen, PermissionPrimerScreen } from './src/components/onboarding';
import { SettingsScreen } from './src/components/SettingsScreen';
import { BuddyAppearancePicker } from './src/components/buddy';
import { useBuddyAppearance } from './src/components/useBuddyAppearance';
import { useAmbientMusic } from './src/app/useAmbientMusic';
import { useMusicEnabled } from './src/feedback/feedbackPrefs';
import { dogDisplayName } from './src/economy/denEconomy';
import { requestNotificationPermission } from './src/notifications/scheduler';

// Stable reference for useLiveSharePrompt's effect.
const getSyncStatus = () => syncEngine.getStatus();

// Keep the native splash up until the fonts gate opens, so no blank frame flashes.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Composition root. Hook order matters: effects run in call order, and it
// mirrors the old single-component App (language/splash, buddy look, manual-log
// quota, first launch + location permission, then the once-per-launch routine).
export default function App() {
  const { ready, localePreference, changeLocalePreference } = useAppReady(repos);
  const ota = useOtaUpdates();
  const nav = useNavigation();
  const { screen } = nav;
  const [homeRangeRefreshKey, setHomeRangeRefreshKey] = useState(0);
  const bumpRangeRefresh = () => setHomeRangeRefreshKey((k) => k + 1);
  const [treats, setTreats] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  // "Somewhere Wild": the marker and the card are both driven from this single
  // piece of state, so they always agree on the same spot.
  const [wildSpot, setWildSpot] = useState<SomewhereWildSpot | null>(null);
  const [panToSpot, setPanToSpot] = useState<(SomewhereWildSpot & { requestId: number }) | null>(null);

  const { celebration, showCelebration, dismissCelebration } = useCelebration();
  const { appearance: buddyAppearance, loaded: buddyAppearanceLoaded, saveAppearance } = useBuddyAppearance(repos.buddyAppearanceRepository);

  // Owned here (not in useFirstLaunch) because the walk session needs it and
  // the first-launch flow needs the walk session's error setter.
  const [dogName, setDogName] = useState<string | null>(null);

  // Household sync (multiplayer-sync): server Den state / Range changes flow back into React state.
  useSync(syncEngine, {
    onDenChanged: (state) => {
      setTreats(state.treats);
      setLevel(state.level);
      if (state.dogName) setDogName(state.dogName);
    },
    onRangeChanged: bumpRangeRefresh,
    onPartnerWalks,
    onCommandRejected: (error) => {
      // Gentle, never an error tone (Buddy anti-guilt rule); the Den already shows the server's balance.
      if (error === 'insufficient-treats') Alert.alert(t('household.notEnoughTreats'));
      else if (error === 'max-level') Alert.alert(t('household.alreadyUpgraded'));
    },
  });

  // Live presence: watch the household's walks while the app is in front (long-poll, stops in the background).
  usePresenceViewer(presenceViewer, syncEngine);

  const walkSession = useWalkSession({
    repos,
    sync: syncEngine,
    presence: presenceSender,
    activeWalk: activeWalkRecorder,
    dogName,
    onRangeChanged: bumpRangeRefresh,
    onRewards: (outcome) => {
      setTreats(outcome.treats);
      setLevel(outcome.level);
      // Wild Extras: remembered in memory until the Den next opens (never played over the walk or celebration).
      queueWalkTrigger(
        outcome.wildExtra
          ? { distanceKm: outcome.wildExtra.distanceKm, walkIndex: outcome.wildExtra.walkIndex, isWeekend: isWeekend(outcome.wildExtra.closedAt) }
          : null,
        outcome.celebration.leveledUpTo !== null
      );
      showCelebration({
        walkId: outcome.walkId,
        rewards: outcome.celebration,
        territoryBeat: outcome.territoryBeat,
        distanceMeters: outcome.distanceMeters,
        territoryName: outcome.territoryName,
        walkTime: outcome.wildExtra?.closedAt,
      });
    },
  });
  // The one-time "may {partner} see your walk live?" question at the first walk start (opt-in; nothing is sent before a yes).
  const liveShare = useLiveSharePrompt({
    settings: repos.settingsRepository,
    getStatus: getSyncStatus,
    isTracking: walkSession.isTracking,
    presence: presenceSender,
  });
  const firstLaunch = useFirstLaunch(repos, { dogName, setDogName }, walkSession.setError);
  useAmbientMusic({
    screen: celebration ? 'celebration' : screen,
    walkActive: walkSession.isTracking,
    // Silent during the first-launch flow (cards, name, look, primer): nav.screen is still 'doorstep' there.
    enabled: useMusicEnabled() && firstLaunch.step === 'done',
  });

  const manualLog = useManualWalkLog(repos, {
    sync: syncEngine,
    screenOpen: screen === 'logMissedWalk',
    onRangeChanged: bumpRangeRefresh,
    onLogged: (outcome) => {
      setTreats(outcome.treats);
      setLevel(outcome.level);
      // Every dismiss of Log a Missed Walk returns to the Doorstep; the
      // celebration renders on top of it and always wins (see below).
      nav.goDoorstep();
      showCelebration({ walkId: outcome.walkId, rewards: outcome.celebration, territoryBeat: null, manual: true });
    },
  });

  const launch = useLaunchEffects({
    repos,
    applyFirstLaunch: firstLaunch.applyLoaded,
    setTreats,
    setLevel,
    openDen: () => nav.goTo('den'),
    openDoorstep: nav.goDoorstep,
    onRangeChanged: bumpRangeRefresh,
    syncOnLaunch,
    loadHouseholdLines,
  });

  // A walk that was in flight when the app was closed or killed comes back (or is finished) once the first-launch state is
  // loaded; a resumed walk lands on the live map.
  useWalkRestore(firstLaunch.step === 'done', {
    activeWalk: activeWalkRecorder,
    isWalkSaved: async (id) => (await repos.walkRepository.getWalk(id)) !== null,
    getAutoFinishEnabled: () => repos.settingsRepository.getAutoFinishEnabled(),
    session: walkSession,
    openMap: () => nav.goTo('map'),
  });

  // The mini homecoming of a household partner ("Alex und Buddy sind zurück"): waits until nothing else is going on
  // (no walk in progress, no own celebration, the world scene in front), then plays once.
  const partnerReturn = usePartnerHomecoming(
    partnerHomecoming,
    firstLaunch.step === 'done' && !celebration && !walkSession.isTracking && screen === 'doorstep'
  );

  // Android hardware back (and the iOS edge swipe, which calls the same registry): overlays and in-screen subviews
  // register their own handlers on top of this one; this is the bottom layer, the screen stack. Never finishes or
  // cancels a walk. Registered before any child mounts, so every child handler sits above it.
  useBackAction(true, () => {
    switch (
      resolveAppBack({
        firstLaunchDone: firstLaunch.step === 'done',
        homecomingPlaying: !!celebration || !!partnerReturn.request,
        screen,
        viewingWalk: !!nav.viewingWalk,
        walkActive: walkSession.isTracking,
      })
    ) {
      case 'default':
        return false;
      case 'consume':
        return true;
      case 'closeWalkPortrait':
        nav.viewWalk(null);
        return true;
      case 'doorstep':
        nav.goDoorstep();
        return true;
      case 'pop':
        return nav.back();
    }
  });
  useHardwareBack();

  // Fonts + language gate: first render waits so no screen flashes the system
  // font or the wrong language.
  if (!ready) return null;
  switch (firstLaunch.step) {
    case 'loading':
      // Cream loading view until Den state + settings are read.
      return <LoadingView />;
    case 'onboarding':
      return (
        <ScreenFrame fadeKey="onboarding">
          <OnboardingScreen buddyAppearance={buddyAppearance} onDone={firstLaunch.finishCards} />
        </ScreenFrame>
      );
    case 'dogName':
      return (
        <ScreenFrame fadeKey="dog-name">
          <DogNamePromptScreen onSubmit={firstLaunch.submitDogName} buddyAppearance={buddyAppearance} />
        </ScreenFrame>
      );
    case 'look':
      return (
        <ScreenFrame fadeKey="buddy-look" safeArea>
          <BuddyAppearancePicker
            name={dogDisplayName(dogName)}
            initial={buddyAppearance}
            topInset={16} // inside SafeAreaView already; just a little breathing room
            onSave={(look) => {
              saveAppearance(look);
              firstLaunch.finishLookStep();
            }}
            // Skipping keeps the default look, saved so the picker never reappears.
            onSkip={() => {
              saveAppearance(buddyAppearance);
              firstLaunch.finishLookStep();
            }}
          />
        </ScreenFrame>
      );
    case 'primer':
      return (
        <ScreenFrame fadeKey="permission-primer">
          <PermissionPrimerScreen
            buddyAppearance={buddyAppearance}
            onRequestLocation={firstLaunch.primerRequestLocation}
            onRequestReminders={requestNotificationPermission}
            onDone={firstLaunch.finishPrimer}
          />
        </ScreenFrame>
      );
    case 'done':
      break;
  }
  // Checked BEFORE the screen switch: logMissedWalk's success path goes to the
  // Doorstep in the same call that sets the celebration, and the celebration
  // (a one-off reward moment, not part of persistent navigation) must win and
  // render on top; the player lands on the Doorstep once they dismiss it.
  const worldScene = (homecoming: { walk: HomecomingWalk; onDone: () => void } | null) => (
      <WorldScene
        dogName={dogName}
        treats={treats ?? 0}
        level={level ?? 1}
        pendingDenAchievements={launch.pendingDenAchievements}
        session={launch.doorstepSession}
        greeting={launch.doorstepGreeting}
        awayStripLines={launch.awayStripLines}
        accruedDelta={launch.accruedDelta}
        territoryIncomeRate={launch.territoryIncomeRate}
        denEconomyRepository={repos.denEconomyRepository}
        personalStatsRepository={repos.personalStatsRepository}
        homeRangeRepository={repos.homeRangeRepository}
        walkRepository={repos.walkRepository}
        settingsRepository={repos.settingsRepository}
        buddyAppearance={buddyAppearance}
        buddyAppearanceLoaded={buddyAppearanceLoaded}
        buddyMood={launch.buddyMood}
        playGreeting={launch.playBuddyGreeting}
        onBuddyGreetingStarted={launch.onBuddyGreetingStarted}
        onAcknowledgePendingAchievements={launch.clearPendingDenAchievements}
        onTreatsChanged={setTreats}
        onUpgraded={(building) => void syncEngine.enqueueCommand({ kind: 'den.upgrade', building })}
        onStartWalk={() => {
          nav.goTo('map');
          walkSession.startWalk();
        }}
        updateCard={ota.showUpdateCard ? { onApply: ota.apply, onLater: ota.dismiss } : undefined}
        walkActive={walkSession.isTracking}
        onOpenMap={() => nav.goTo('map')}
        onOpenHistory={() => nav.goTo('history')}
        onOpenSettings={() => nav.goTo('settings')}
        openDenPanel={screen === 'den' && !homecoming}
        onDenPanelHandled={nav.goDoorstep}
        homecoming={homecoming}
        neighbourhood={syncEngine}
        territoryRepository={repos.territoryRepository}
        onOpenTerritories={() => nav.goTo('territories')}
        homeRangeRefreshKey={homeRangeRefreshKey}
      />
  );

  // The one-off reward moment (a "Heimkehr") plays over the world scene, never as a separate screen.
  // Checked BEFORE the screen switch: logMissedWalk's success path goes to the Doorstep in the same
  // call that sets the celebration, and the player lands on the scene once the homecoming ends.
  if (celebration) {
    const territoryBeat = celebration.territoryBeat;
    return (
      <ScreenFrame fadeKey="celebration">
        {worldScene({
          walk: {
            walkId: celebration.walkId,
            rewards: celebration.rewards,
            newTerritoryName: territoryBeat?.newTerritoryName ?? null,
            mergedTerritoryNames: territoryBeat?.mergedTerritoryNames ?? null,
            territoryName: celebration.territoryName ?? null,
            distanceMeters: celebration.distanceMeters ?? null,
            walkTime: celebration.walkTime ?? Date.now(),
            manual: celebration.manual ?? false,
          },
          onDone: dismissCelebration,
        })}
      </ScreenFrame>
    );
  }

  const fadeKey = screenKey(screen);
  // iOS edge swipe-back around every non-home screen (see EdgeSwipeBack). The key keeps one screen's slid-off state out of the next.
  const swipeable = (id: string, node: React.ReactNode) => (
    <EdgeSwipeBack key={id} onBack={runBackActions}>
      {node}
    </EdgeSwipeBack>
  );
  switch (screen) {
    case 'doorstep':
    case 'den':
      // One scene with three heights (redesign step 1). 'den' is an alias that lands on the same
      // scene with the next-upgrade panel open (notification taps), then settles back to 'doorstep'.
      return (
        <ScreenFrame fadeKey={fadeKey}>
          {worldScene(partnerReturn.request ? { walk: partnerHomecomingWalk(partnerReturn.request), onDone: partnerReturn.done } : null)}
        </ScreenFrame>
      );
    case 'territories':
      return swipeable(
        'territories',
        <ScreenFrame fadeKey={fadeKey}>
          <TerritoriesScreen
            buddyAppearance={buddyAppearance}
            territoryRepository={repos.territoryRepository}
            homeRangeRepository={repos.homeRangeRepository}
            denEconomyRepository={repos.denEconomyRepository}
            onOpenMap={nav.close}
            onClose={nav.close}
          />
        </ScreenFrame>
      );
    case 'history':
      // The Walk Portrait renders above the history list while a walk is being
      // viewed, with the screen left on 'history' underneath, so dismissing it
      // returns to the still-mounted history list, not the map.
      if (nav.viewingWalk) {
        return swipeable(
          'history-portrait',
          <ScreenFrame fadeKey={null}>
            <WalkPortraitScreen
              walk={nav.viewingWalk}
              walkRepository={repos.walkRepository}
              homeRangeRepository={repos.homeRangeRepository}
              dogName={dogName}
              onClose={() => nav.viewWalk(null)}
            />
          </ScreenFrame>
        );
      }
      return swipeable(
        'history',
        <ScreenFrame fadeKey={fadeKey}>
          <WalkHistoryScreen
            buddyAppearance={buddyAppearance}
            repository={repos.walkRepository}
            homeRangeRepository={repos.homeRangeRepository}
            onSelectWalk={nav.viewWalk}
            onWalkDeleted={(id) => void syncEngine.enqueueWalkDelete(id).catch(() => undefined)}
            onClose={() => {
              bumpRangeRefresh();
              nav.close();
            }}
          />
        </ScreenFrame>
      );
    case 'debugLog':
      return swipeable(
        'debugLog',
        <ScreenFrame fadeKey={fadeKey}>
          <DebugLogScreen notificationRepository={repos.notificationRepository} onClose={nav.close} />
        </ScreenFrame>
      );
    case 'settings':
      return swipeable(
        'settings',
        <ScreenFrame fadeKey={fadeKey}>
          <SettingsScreen
            notificationRepository={repos.notificationRepository}
            walkRepository={repos.walkRepository}
            settingsRepository={repos.settingsRepository}
            dogName={dogName}
            buddyAppearance={buddyAppearance}
            walkActive={walkSession.isTracking}
            syncEngine={syncEngine}
            about={{ versionLabel: ota.currentVersionLabel, onCheck: ota.checkNow }}
            onSaveAppearance={saveAppearance}
            onOpenLogMissedWalk={() => nav.goTo('logMissedWalk')}
            onOpenDebugLog={() => nav.goTo('debugLog')}
            localePreference={localePreference}
            onChangeLocalePreference={changeLocalePreference}
            onClose={nav.close}
          />
        </ScreenFrame>
      );
    case 'stats':
      return swipeable(
        'stats',
        <ScreenFrame fadeKey={fadeKey}>
          <StatsScreen
            buddyAppearance={buddyAppearance}
            repository={repos.personalStatsRepository}
            denEconomyRepository={repos.denEconomyRepository}
            onClose={nav.close}
          />
        </ScreenFrame>
      );
    case 'logMissedWalk':
      return swipeable(
        'logMissedWalk',
        <ScreenFrame fadeKey={fadeKey}>
          <LogMissedWalkScreen
            onLog={manualLog.logMissedWalk}
            onClose={nav.close}
            walkRepository={repos.walkRepository}
            routeRefreshAvailable={manualLog.routeRefreshAvailable}
          />
        </ScreenFrame>
      );
    case 'map':
      return swipeable(
        'map',
        <>
          <LiveSharePrompt visible={liveShare.visible} partnerName={liveShare.partnerName} onAnswer={liveShare.answer} />
          <MapScreen
            repos={repos}
            walk={walkSession.walk}
            isTracking={walkSession.isTracking}
            error={walkSession.error}
            autoFinishEnabled={walkSession.autoFinishEnabled}
            homeCountdownMin={walkSession.homeCountdownMin}
            dogName={dogName}
            treats={treats}
            level={level}
            homeRangeRefreshKey={homeRangeRefreshKey}
            wildSpot={wildSpot}
            panToSpot={panToSpot}
            onWildSpotChange={setWildSpot}
            onTapWildSpot={(spot) => setPanToSpot({ ...spot, requestId: Date.now() })}
            onOpenTerritories={() => nav.goTo('territories')}
            neighbourhood={syncEngine}
            onBackToDoorstep={nav.goDoorstep}
            onFinishWalk={walkSession.finishWalk}
            onCancelWalk={walkSession.cancelWalk}
            onNewWalk={() => {
              walkSession.newWalk();
              // The idle map has no Start Walk button (home-dashboard design.md
              // Decision 9), so "New Walk" returns to the Doorstep.
              nav.goDoorstep();
            }}
          />
        </>
      );
  }
}
