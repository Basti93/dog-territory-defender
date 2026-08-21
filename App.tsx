import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import { Walk, AppState as AppStateType } from './src/types';
import { requestLocationPermission, startWatchingLocation, stopWatchingLocation, getInitialLocation } from './src/utils/gps';
import { canCloseWalk, locationsToPolygon, cumulativeDistance, getDistance } from './src/utils/geometry';
import { isWithinManualLogWindow, MissedWalkTiming, startTimeForMissedWalk } from './src/utils/manualWalkLog';
import { MapView } from './src/components/MapView';
import { createSqliteWalkRepository } from './src/storage/sqliteWalkRepository';
import { WalkHistoryScreen } from './src/components/WalkHistoryScreen';
import { DenScreen } from './src/components/DenScreen';
import { CelebrationScreen } from './src/components/CelebrationScreen';
import { DebugLogScreen } from './src/components/DebugLogScreen';
import { StatsScreen } from './src/components/StatsScreen';
import { LogMissedWalkScreen } from './src/components/LogMissedWalkScreen';
import { createSqliteDenEconomyRepository } from './src/storage/sqliteDenEconomyRepository';
import { createSqlitePersonalStatsRepository } from './src/storage/sqlitePersonalStatsRepository';
import { createSqliteNotificationRepository } from './src/storage/sqliteNotificationRepository';
import { applyPassiveAccrual } from './src/economy/denEconomy';
import { AchievementId, recordTreatsEarned } from './src/economy/personalStats';
import { awardWalkRewards, WalkRewardsCelebration } from './src/economy/walkRewards';
import { checkAndScheduleEarnedTriggerNotification } from './src/notifications/earnedTrigger';
import { DEN_OVERFLOW_NOTIFICATION_DATA } from './src/notifications/scheduler';
import { log } from './src/utils/log';

const walkRepository = createSqliteWalkRepository();
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
  const [showDen, setShowDen] = useState(false);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showLogMissedWalk, setShowLogMissedWalk] = useState(false);
  const [territoryRefreshKey, setTerritoryRefreshKey] = useState(0);
  const [treats, setTreats] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [pendingDenAchievements, setPendingDenAchievements] = useState<AchievementId[]>([]);
  const [celebration, setCelebration] = useState<WalkRewardsCelebration | null>(null);

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

  // Recompute/reschedule the earned-trigger notification each time the app opens
  // (see openspec/changes/walk-start-notifications/design.md's accepted check cadence —
  // there's no backend to wake the app while it's closed).
  useEffect(() => {
    checkAndScheduleEarnedTriggerNotification({ denEconomyRepository, walkRepository, notificationRepository }).catch(
      (err) => log('NOTIFICATION_CHECK_ERROR', { error: String(err) })
    );
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

  // Apply passive treat accrual since last open, then load the balance
  useEffect(() => {
    (async () => {
      const state = await denEconomyRepository.getState();
      const accrued = applyPassiveAccrual(state, Date.now());
      await denEconomyRepository.saveState(accrued);
      log('TREATS_PASSIVE_ACCRUAL', {
        before: state.treats,
        after: accrued.treats,
        elapsedHours: (Date.now() - state.lastTickAt) / (1000 * 60 * 60),
      });
      setTreats(accrued.treats);
      setLevel(accrued.level);

      const accruedDelta = accrued.treats - state.treats;
      if (accruedDelta > 0) {
        const personalStats = await personalStatsRepository.getState();
        const { stats: nextPersonalStats, newlyUnlocked } = recordTreatsEarned(personalStats, accruedDelta);
        await personalStatsRepository.saveState(nextPersonalStats);
        if (newlyUnlocked.length > 0) {
          await personalStatsRepository.unlockAchievements(newlyUnlocked, Date.now());
          setPendingDenAchievements(newlyUnlocked);
        }
      }
    })();
  }, []);

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

  const stopWalk = async () => {
    await stopWatchingLocation();

    if (appState.walk) {
      const startEndDistance = getDistance(
        appState.walk.locations[0].latitude,
        appState.walk.locations[0].longitude,
        appState.walk.locations[appState.walk.locations.length - 1].latitude,
        appState.walk.locations[appState.walk.locations.length - 1].longitude
      );

      // Check if can close
      const canClose = canCloseWalk(appState.walk.locations);
      log('WALK_CLOSURE_CHECK', { points: appState.walk.locations.length, startEndDistance, canClose });

      if (canClose) {
        const polygon = locationsToPolygon(appState.walk.locations);
        const closedWalk: Walk = { ...appState.walk, closed: true, territory: polygon || undefined };
        setAppState((prev) => ({
          ...prev,
          walk: prev.walk ? closedWalk : null,
          isTracking: false,
        }));
        log('WALK_CLOSED', { id: closedWalk.id, areaM2: polygon?.area, points: closedWalk.locations.length });

        walkRepository
          .saveWalk(closedWalk)
          .then(() => log('STORAGE_WALK_SAVED', { id: closedWalk.id, closed: true }))
          .catch((err) => {
            console.error('Failed to save walk:', err);
            log('STORAGE_WALK_SAVE_ERROR', { id: closedWalk.id, error: String(err) });
          });

        const distanceMeters = cumulativeDistance(closedWalk.locations);
        awardWalkRewards(closedWalk, distanceMeters, polygon?.area ?? 0, {
          denEconomyRepository,
          personalStatsRepository,
          walkRepository,
        })
          .then((result) => {
            setTreats(result.denEconomyState.treats);
            setLevel(result.denEconomyState.level);
            setCelebration(result.celebration);
          })
          .catch((err) => console.error('Failed to award walk treats:', err));
      } else {
        Alert.alert('Not closed', 'Walk does not form a closed loop (start and end within 20m)');
        setAppState((prev) => ({
          ...prev,
          isTracking: false,
        }));
      }
    }
  };

  // "Log a walk we missed" — a standalone, one-step, direct-reward action.
  // No live GPS trail, no polygon, no notification tied to it (see
  // openspec/changes/walk-start-notifications/proposal.md's scope cut).
  // Reuses the exact same reward path a tracked walk gets, via awardWalkRewards.
  const logMissedWalk = async (timing: MissedWalkTiming) => {
    const now = Date.now();
    const startTime = startTimeForMissedWalk(timing, now);

    if (!isWithinManualLogWindow(startTime, now)) {
      Alert.alert('Too far back', 'Missed walks can only be logged from today or yesterday.');
      return;
    }

    const manualWalk: Walk = {
      id: `manual-${now}`,
      startTime,
      locations: [],
      closed: true,
      territory: undefined,
      startSource: 'manual-log',
    };

    log('WALK_MANUAL_LOG', { id: manualWalk.id, timing });

    try {
      await walkRepository.saveWalk(manualWalk);
      log('STORAGE_WALK_SAVED', { id: manualWalk.id, closed: true, startSource: 'manual-log' });

      const result = await awardWalkRewards(manualWalk, 0, 0, {
        denEconomyRepository,
        personalStatsRepository,
        walkRepository,
      });
      setTreats(result.denEconomyState.treats);
      setLevel(result.denEconomyState.level);
      setShowLogMissedWalk(false);
      setCelebration(result.celebration);
    } catch (err) {
      console.error('Failed to log missed walk:', err);
      log('WALK_MANUAL_LOG_ERROR', { id: manualWalk.id, error: String(err) });
    }
  };

  const endWalk = async () => {
    await stopWatchingLocation();

    if (appState.walk) {
      log('WALK_ENDED_EARLY', { id: appState.walk.id, points: appState.walk.locations.length });
      walkRepository
        .saveWalk(appState.walk)
        .then(() => log('STORAGE_WALK_SAVED', { id: appState.walk!.id, closed: false }))
        .catch((err) => {
          console.error('Failed to save walk:', err);
          log('STORAGE_WALK_SAVE_ERROR', { id: appState.walk!.id, error: String(err) });
        });
    }

    setAppState((prev) => ({
      ...prev,
      isTracking: false,
    }));
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

  const canClose = appState.walk ? canCloseWalk(appState.walk.locations) : false;

  if (celebration) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <CelebrationScreen
            areaM2={celebration.areaM2}
            hasTerritory={celebration.hasTerritory}
            treatsEarned={celebration.treatsEarned}
            tease={celebration.tease}
            unlockedAchievements={celebration.unlockedAchievements}
            leveledUpTo={celebration.leveledUpTo}
            onContinue={() => setCelebration(null)}
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
            onClose={() => {
              setShowHistory(false);
              setTerritoryRefreshKey((k) => k + 1);
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
          <LogMissedWalkScreen onLog={logMissedWalk} onClose={() => setShowLogMissedWalk(false)} />
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
          territory={appState.walk?.territory}
          currentLocation={appState.walk?.locations[appState.walk.locations.length - 1]}
          walkRepository={walkRepository}
          territoryRefreshKey={territoryRefreshKey}
        />
      </View>

      {/* Bottom controls */}
      <View style={styles.controls}>
        <View style={styles.stats}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>{distance.toFixed(2)} km</Text>

          <Text style={[styles.statLabel, { marginLeft: 20 }]}>Points</Text>
          <Text style={styles.statValue}>{appState.walk?.locations.length || 0}</Text>

          <Text style={[styles.statLabel, { marginLeft: 20 }]}>Treats</Text>
          <Text style={styles.statValue}>{treats !== null ? Math.floor(treats) : '…'}</Text>

          <Text style={[styles.statLabel, { marginLeft: 20 }]}>Lv.</Text>
          <Text style={styles.statValue}>{level !== null ? level : '…'}</Text>

          {canClose && <Text style={[styles.statLabel, { marginLeft: 20, color: COLORS.green }]}>🔄 Can close!</Text>}
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
              {canClose && (
                <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={stopWalk}>
                  <Text style={styles.buttonText}>✓ Close Territory</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.button, styles.endButton]} onPress={endWalk}>
                <Text style={styles.buttonText}>End Walk</Text>
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
  endButton: {
    backgroundColor: COLORS.muted,
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
