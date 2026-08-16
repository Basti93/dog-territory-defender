import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Walk, AppState as AppStateType } from './src/types';
import { requestLocationPermission, startWatchingLocation, stopWatchingLocation, getInitialLocation } from './src/utils/gps';
import { canCloseWalk, locationsToPolygon, cumulativeDistance, getDistance } from './src/utils/geometry';
import { MapView } from './src/components/MapView';
import { createSqliteWalkRepository } from './src/storage/sqliteWalkRepository';
import { WalkHistoryScreen } from './src/components/WalkHistoryScreen';
import { DenScreen } from './src/components/DenScreen';
import { CelebrationScreen } from './src/components/CelebrationScreen';
import { DebugLogScreen } from './src/components/DebugLogScreen';
import { createSqliteDenEconomyRepository } from './src/storage/sqliteDenEconomyRepository';
import { applyPassiveAccrual, awardWalkTreats, getUpgradeTease, UpgradeTease } from './src/economy/denEconomy';
import { BALANCE } from './src/economy/balanceConfig';
import { log } from './src/utils/log';

const walkRepository = createSqliteWalkRepository();
const denEconomyRepository = createSqliteDenEconomyRepository();

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
  const [territoryRefreshKey, setTerritoryRefreshKey] = useState(0);
  const [treats, setTreats] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<{
    areaM2: number;
    treatsEarned: number;
    tease: UpgradeTease | null;
  } | null>(null);

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

        denEconomyRepository
          .getState()
          .then((state) => {
            const rewarded = awardWalkTreats(state);
            log('TREATS_AWARD', { amount: BALANCE.treatsPerWalk, before: state.treats, after: rewarded.treats });
            setTreats(rewarded.treats);
            setCelebration({
              areaM2: polygon?.area ?? 0,
              treatsEarned: BALANCE.treatsPerWalk,
              tease: getUpgradeTease(rewarded),
            });
            return denEconomyRepository.saveState(rewarded);
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
            treatsEarned={celebration.treatsEarned}
            tease={celebration.tease}
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
          <DenScreen repository={denEconomyRepository} onClose={() => setShowDen(false)} onTreatsChanged={setTreats} />
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

          {canClose && <Text style={[styles.statLabel, { marginLeft: 20, color: COLORS.green }]}>🔄 Can close!</Text>}
        </View>

        <View style={styles.buttons}>
          {!appState.isTracking ? (
            <>
              <TouchableOpacity style={[styles.button, styles.startButton]} onPress={startWalk}>
                <Text style={styles.buttonText}>Start Walk</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.historyButton]} onPress={() => setShowHistory(true)}>
                <Text style={styles.buttonText}>View Past Walks</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.denButton]} onPress={() => setShowDen(true)}>
                <Text style={styles.buttonText}>The Den</Text>
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
