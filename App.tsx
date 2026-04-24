import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Polyline, Polygon } from 'react-native-maps';
import { StatusBar } from 'expo-status-bar';

import { Walk, AppState as AppStateType } from './src/types';
import { requestLocationPermission, startWatchingLocation, getInitialLocation } from './src/utils/gps';
import { canCloseWalk, locationsToPolygon } from './src/utils/geometry';

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

  const [mapRegion, setMapRegion] = useState({
    latitude: 52.5,
    longitude: 13.4,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  });

  const mapRef = useRef<MapView>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  // Initialize location permission and get starting point
  useEffect(() => {
    (async () => {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setAppState((prev) => ({
          ...prev,
          error: 'Location permission denied',
        }));
        return;
      }

      const initialLoc = await getInitialLocation();
      if (initialLoc) {
        setMapRegion({
          latitude: initialLoc.latitude,
          longitude: initialLoc.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
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
    };

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

        // Center map on current location
        setMapRegion((prev) => ({
          ...prev,
          latitude: location.latitude,
          longitude: location.longitude,
        }));

        return { ...prev, walk: updatedWalk };
      });
    });

    subscriptionRef.current = subscription;
  };

  const stopWalk = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }

    if (appState.walk) {
      // Check if can close
      const canClose = canCloseWalk(appState.walk.locations);
      if (canClose) {
        const polygon = locationsToPolygon(appState.walk.locations);
        setAppState((prev) => ({
          ...prev,
          walk: prev.walk ? { ...prev.walk, closed: true, territory: polygon || undefined } : null,
          isTracking: false,
        }));
        Alert.alert('Success!', `Territory claimed! Area: ${polygon?.area.toFixed(0) || '?'} m²`);
      } else {
        Alert.alert('Not closed', 'Walk does not form a closed loop (start and end within 20m)');
        setAppState((prev) => ({
          ...prev,
          isTracking: false,
        }));
      }
    }
  };

  const resetWalk = () => {
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        region={mapRegion}
        onRegionChange={setMapRegion}
      >
        {/* Walk trail */}
        {appState.walk && appState.walk.locations.length > 1 && (
          <Polyline
            coordinates={appState.walk.locations.map((loc) => ({
              latitude: loc.latitude,
              longitude: loc.longitude,
            }))}
            strokeColor={COLORS.blue}
            strokeWidth={3}
            lineDashPattern={[5, 5]}
          />
        )}

        {/* Territory polygon (if closed) */}
        {appState.walk && appState.walk.territory && (
          <Polygon
            coordinates={appState.walk.territory.coordinates.map((coords) => ({
              latitude: coords[0],
              longitude: coords[1],
            }))}
            fillColor={`${COLORS.green}33`}
            strokeColor={COLORS.green}
            strokeWidth={2}
          />
        )}
      </MapView>

      {/* Bottom controls */}
      <View style={styles.controls}>
        <View style={styles.stats}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>{distance.toFixed(2)} km</Text>

          <Text style={[styles.statLabel, { marginLeft: 20 }]}>Points</Text>
          <Text style={styles.statValue}>{appState.walk?.locations.length || 0}</Text>

          {canClose && <Text style={[styles.statLabel, { marginLeft: 20, color: COLORS.green }]}>🔄 Can close!</Text>}
        </View>

        <View style={styles.buttons}>
          {!appState.isTracking ? (
            <TouchableOpacity style={[styles.button, styles.startButton]} onPress={startWalk}>
              <Text style={styles.buttonText}>Start Walk</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.button, styles.stopButton, !canClose && styles.disabled]}
                onPress={stopWalk}
                disabled={!canClose}
              >
                <Text style={styles.buttonText}>
                  {canClose ? '✓ Close Territory' : 'Keep walking...'}
                </Text>
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
