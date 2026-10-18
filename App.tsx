import './src/app/devWarnings';
import React, { useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';


import { repos } from './src/app/repositories';
import { screenKey, useNavigation } from './src/app/navigation';
import { useWalkSession } from './src/app/useWalkSession';
import { useCelebration } from './src/app/useCelebration';
import { useFirstLaunch } from './src/app/useFirstLaunch';
import { useLaunchEffects } from './src/app/useLaunchEffects';
import { useManualWalkLog } from './src/app/useManualWalkLog';
import { useAppReady } from './src/app/useAppReady';
import { LoadingView, ScreenFrame } from './src/app/ScreenFrame';
import { MapScreen } from './src/app/MapScreen';
import { SomewhereWildSpot } from './src/components/SomewhereWildCard';
import { TerritoriesScreen } from './src/components/TerritoriesScreen';
import { WalkHistoryScreen } from './src/components/WalkHistoryScreen';
import { WalkPortraitScreen } from './src/components/WalkPortraitScreen';
import { DenScreen } from './src/components/DenScreen';
import { isWeekend, queueWalkTrigger } from './src/components/den/wildExtras';
import { DoorstepScreen } from './src/components/DoorstepScreen';
import { CelebrationScreen } from './src/components/CelebrationScreen';
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

// Keep the native splash up until the fonts gate opens, so no blank frame flashes.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Composition root. Hook order matters: effects run in call order, and it
// mirrors the old single-component App (language/splash, buddy look, manual-log
// quota, first launch + location permission, then the once-per-launch routine).
export default function App() {
  const { ready, localePreference, changeLocalePreference } = useAppReady(repos);
  const nav = useNavigation();
  const { screen } = nav;
  const [homeRangeRefreshKey, setHomeRangeRefreshKey] = useState(0);
  const bumpRangeRefresh = () => setHomeRangeRefreshKey((k) => k + 1);
  const [treats, setTreats] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  // The Den shows the "while you were away" treat float-up once per launch.
  const [denAccrualShown, setDenAccrualShown] = useState(false);
  // "Somewhere Wild": the marker and the card are both driven from this single
  // piece of state, so they always agree on the same spot.
  const [wildSpot, setWildSpot] = useState<SomewhereWildSpot | null>(null);
  const [panToSpot, setPanToSpot] = useState<(SomewhereWildSpot & { requestId: number }) | null>(null);

  const { celebration, showCelebration, dismissCelebration } = useCelebration();
  const { appearance: buddyAppearance, loaded: buddyAppearanceLoaded, saveAppearance } = useBuddyAppearance(repos.buddyAppearanceRepository);

  // Owned here (not in useFirstLaunch) because the walk session needs it and
  // the first-launch flow needs the walk session's error setter.
  const [dogName, setDogName] = useState<string | null>(null);

  const walkSession = useWalkSession({
    repos,
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
      showCelebration({ walkId: outcome.walkId, rewards: outcome.celebration, territoryBeat: outcome.territoryBeat });
    },
  });
  const firstLaunch = useFirstLaunch(repos, { dogName, setDogName }, walkSession.setError);
  useAmbientMusic({
    screen: celebration ? 'celebration' : screen,
    walkActive: walkSession.isTracking,
    // Silent during the first-launch flow (cards, name, look, primer): nav.screen is still 'doorstep' there.
    enabled: useMusicEnabled() && firstLaunch.step === 'done',
  });

  const manualLog = useManualWalkLog(repos, {
    screenOpen: screen === 'logMissedWalk',
    onRangeChanged: bumpRangeRefresh,
    onLogged: (outcome) => {
      setTreats(outcome.treats);
      setLevel(outcome.level);
      // Every dismiss of Log a Missed Walk returns to the Doorstep; the
      // celebration renders on top of it and always wins (see below).
      nav.goDoorstep();
      showCelebration({ walkId: outcome.walkId, rewards: outcome.celebration, territoryBeat: null });
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
  });

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
  if (celebration) {
    const { rewards } = celebration;
    return (
      <ScreenFrame fadeKey="celebration">
        <CelebrationScreen
          cellsPainted={rewards.cellsPainted}
          hasTerritory={rewards.hasTerritory}
          treatsEarned={rewards.treatsEarned}
          tease={rewards.tease}
          unlockedAchievements={rewards.unlockedAchievements}
          leveledUpTo={rewards.leveledUpTo}
          oldTreatsPerWalk={rewards.oldTreatsPerWalk}
          newTreatsPerWalk={rewards.newTreatsPerWalk}
          cliffhangerTitle={rewards.cliffhangerTitle}
          newGroundCellCount={rewards.newGroundCellCount}
          bloomMultiplier={rewards.bloomMultiplier}
          newTerritoryName={celebration.territoryBeat?.newTerritoryName ?? null}
          mergedTerritoryNames={celebration.territoryBeat?.mergedTerritoryNames ?? null}
          dogName={dogName}
          buddyAppearance={buddyAppearance}
          walkId={celebration.walkId}
          onContinue={dismissCelebration}
        />
      </ScreenFrame>
    );
  }

  const fadeKey = screenKey(screen);
  switch (screen) {
    case 'doorstep':
      return (
        <ScreenFrame fadeKey={fadeKey}>
          <DoorstepScreen
            dogName={dogName}
            treats={treats ?? 0}
            level={level ?? 1}
            accruedDelta={launch.accruedDelta}
            pendingDenAchievements={launch.pendingDenAchievements}
            session={launch.doorstepSession}
            greeting={launch.doorstepGreeting}
            awayStripLines={launch.awayStripLines}
            denEconomyRepository={repos.denEconomyRepository}
            homeRangeRepository={repos.homeRangeRepository}
            walkRepository={repos.walkRepository}
            buddyAppearance={buddyAppearance}
            buddyAppearanceLoaded={buddyAppearanceLoaded}
            buddyMood={launch.buddyMood}
            playGreeting={launch.playBuddyGreeting}
            onBuddyGreetingStarted={launch.onBuddyGreetingStarted}
            territoryRepository={repos.territoryRepository}
            territoryIncomeRate={launch.territoryIncomeRate}
            onAcknowledgePendingAchievements={launch.clearPendingDenAchievements}
            onStartWalk={() => {
              nav.goTo('map');
              walkSession.startWalk();
            }}
            onOpenMap={() => nav.goTo('map')}
            onOpenDen={() => nav.goTo('den')}
            onOpenHistory={() => nav.goTo('history')}
            onOpenStats={() => nav.goTo('stats')}
            onOpenDebugLog={() => nav.goTo('debugLog')}
            onOpenLogMissedWalk={() => nav.goTo('logMissedWalk')}
            onOpenSettings={() => nav.goTo('settings')}
          />
        </ScreenFrame>
      );
    case 'territories':
      return (
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
        return (
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
      return (
        <ScreenFrame fadeKey={fadeKey}>
          <WalkHistoryScreen
            buddyAppearance={buddyAppearance}
            repository={repos.walkRepository}
            homeRangeRepository={repos.homeRangeRepository}
            onSelectWalk={nav.viewWalk}
            onClose={() => {
              bumpRangeRefresh();
              nav.close();
            }}
          />
        </ScreenFrame>
      );
    case 'den':
      return (
        <ScreenFrame fadeKey={fadeKey}>
          <DenScreen
            repository={repos.denEconomyRepository}
            personalStatsRepository={repos.personalStatsRepository}
            homeRangeRepository={repos.homeRangeRepository}
            buddyAppearance={buddyAppearance}
            settingsRepository={repos.settingsRepository}
            sessionKind={launch.doorstepSession?.kind}
            accruedSinceLastVisit={denAccrualShown ? 0 : launch.accruedDelta}
            onAccrualShown={() => setDenAccrualShown(true)}
            pendingAchievements={launch.pendingDenAchievements}
            onAcknowledgePendingAchievements={launch.clearPendingDenAchievements}
            onClose={nav.close}
            onTreatsChanged={setTreats}
          />
        </ScreenFrame>
      );
    case 'debugLog':
      return (
        <ScreenFrame fadeKey={fadeKey}>
          <DebugLogScreen notificationRepository={repos.notificationRepository} onClose={nav.close} />
        </ScreenFrame>
      );
    case 'settings':
      return (
        <ScreenFrame fadeKey={fadeKey}>
          <SettingsScreen
            notificationRepository={repos.notificationRepository}
            walkRepository={repos.walkRepository}
            dogName={dogName}
            buddyAppearance={buddyAppearance}
            walkActive={walkSession.isTracking}
            onSaveAppearance={saveAppearance}
            localePreference={localePreference}
            onChangeLocalePreference={changeLocalePreference}
            onClose={nav.close}
          />
        </ScreenFrame>
      );
    case 'stats':
      return (
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
      return (
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
      return (
        <MapScreen
          repos={repos}
          walk={walkSession.walk}
          isTracking={walkSession.isTracking}
          error={walkSession.error}
          dogName={dogName}
          treats={treats}
          level={level}
          homeRangeRefreshKey={homeRangeRefreshKey}
          wildSpot={wildSpot}
          panToSpot={panToSpot}
          onWildSpotChange={setWildSpot}
          onTapWildSpot={(spot) => setPanToSpot({ ...spot, requestId: Date.now() })}
          onOpenTerritories={() => nav.goTo('territories')}
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
      );
  }
}
