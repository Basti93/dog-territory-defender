import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';

import { Walk, AppState as AppStateType, Location as LocationType } from './src/types';
import { requestLocationPermission, startWatchingLocation, getInitialLocation } from './src/utils/gps';
import { canCloseWalk, locationsToPolygon } from './src/utils/geometry';
import { MapView } from './src/components/MapView';
import { startMockWalk, MockWalkHandle } from './src/utils/mockGps';
import { mockClosedLoop, mockOpenWalk } from './src/utils/mockWalkFixtures';
import { createSqliteWalkRepository } from './src/storage/sqliteWalkRepository';
import { WalkHistoryScreen } from './src/components/WalkHistoryScreen';
import { DenScreen } from './src/components/DenScreen';
import { CelebrationScreen } from './src/components/CelebrationScreen';
import { createSqliteDenEconomyRepository } from './src/storage/sqliteDenEconomyRepository';
import { applyPassiveAccrual, awardWalkTreats, getUpgradeTease, UpgradeTease } from './src/economy/denEconomy';
import { BALANCE } from './src/economy/balanceConfig';
import { log } from './src/utils/log';
import { getDistance } from './src/utils/geometry';

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
  const [territoryRefreshKey, setTerritoryRefreshKey] = useState(0);
  const [treats, setTreats] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<{
    areaM2: number;
    treatsEarned: number;
    tease: UpgradeTease | null;
  } | null>(null);

  const subscriptionRef = useRef<Location.LocationSubscription | MockWalkHandle | null>(null);

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

    // Start watching location
    const subscription = await startWatchingLocation((location) => {
      setAppState((prev) => {
        if (!prev.walk) return prev;

        const updatedWalk = {
          ...prev.walk,
          locations: [...prev.walk.locations, location],
        };

        return { ...prev, walk: updatedWalk };
      });
    });

    subscriptionRef.current = subscription;
  };

  const startMockWalkFlow = (fixture: LocationType[]) => {
    const [initial, ...rest] = fixture;

    const newWalk: Walk = {
      id: Date.now().toString(),
      startTime: Date.now(),
      locations: [initial],
      closed: false,
    };

    setAppState((prev) => ({
      ...prev,
      walk: newWalk,
      isTracking: true,
    }));

    subscriptionRef.current = startMockWalk(rest, (location) => {
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

  const stopWalk = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }

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

  const endWalk = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }

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

  const resetWalk = () => {
    if (appState.walk) {
      log('WALK_CANCELLED', { id: appState.walk.id, points: appState.walk.locations.length });
    }
    setAppState({
      walk: null,
      isTracking: false,
      error: null,
    });
  };

  const distance = appState.walk
    ? appState.walk.locations.length > 0
      ? (appState.walk.locations.length * 2) / 1000 // Rough: ~2m per location point
      : 0
    : 0;

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
              {__DEV__ && (
                <>
                  <TouchableOpacity
                    style={[styles.button, styles.devButton]}
                    onPress={() => startMockWalkFlow(mockClosedLoop)}
                  >
                    <Text style={styles.buttonText}>🧪 Load Mock Closed Loop</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.devButton]}
                    onPress={() => startMockWalkFlow(mockOpenWalk)}
                  >
                    <Text style={styles.buttonText}>🧪 Load Mock Open Walk</Text>
                  </TouchableOpacity>
                </>
              )}
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
  devButton: {
    backgroundColor: COLORS.text,
  },
  historyButton: {
    backgroundColor: COLORS.blue,
  },
  denButton: {
    backgroundColor: '#8B6F47',
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
