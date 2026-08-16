import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Location as LocationType } from '../types';
import { log } from './log';

const LOCATION_TASK_NAME = 'dog-territory-location-task';

let currentSubscriber: ((location: LocationType) => void) | null = null;

function toLocationType(position: Location.LocationObject): LocationType {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    timestamp: position.timestamp,
  };
}

// Registered once at module load — required so the task is known even if it
// fires while the app was relaunched headlessly by the OS.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    log('GPS_TASK_ERROR', { error: String(error) });
    return;
  }
  const { locations } = data as { locations: Location.LocationObject[] };
  locations.forEach((position) => {
    log('GPS_UPDATE', {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: position.coords.accuracy,
      gpsTimestamp: position.timestamp,
    });
    currentSubscriber?.(toLocationType(position));
  });
});

export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const bg = await Location.requestBackgroundPermissionsAsync();
      log('GPS_PERMISSION', { foreground: status, background: bg.status });
      return true;
    }
    log('GPS_PERMISSION', { foreground: status, background: 'not-requested' });
    return false;
  } catch (error) {
    console.error('Location permission error:', error);
    log('GPS_PERMISSION_ERROR', { error: String(error) });
    return false;
  }
}

/**
 * Starts a foreground-service-backed location task (Android) — this is what
 * keeps GPS accuracy from being throttled while backgrounded, unlike a plain
 * watchPositionAsync subscription. Callers keep the same callback-based API;
 * the task-manager plumbing is entirely internal.
 */
export async function startWatchingLocation(callback: (location: LocationType) => void): Promise<boolean> {
  try {
    currentSubscriber = callback;
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 1000,
      distanceInterval: 2,
      foregroundService: {
        notificationTitle: 'Dog Territory Defender',
        notificationBody: 'Tracking your walk…',
        notificationColor: '#2ECC71',
      },
    });
    log('GPS_WATCH_STARTED');
    return true;
  } catch (error) {
    console.error('Error watching location:', error);
    log('GPS_WATCH_ERROR', { error: String(error) });
    currentSubscriber = null;
    return false;
  }
}

export async function stopWatchingLocation(): Promise<void> {
  currentSubscriber = null;
  const isRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    log('GPS_WATCH_STOPPED');
  }
}

export async function getInitialLocation(): Promise<LocationType | null> {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    log('GPS_INITIAL_FIX', { lat: position.coords.latitude, lon: position.coords.longitude });
    return toLocationType(position);
  } catch (error) {
    console.error('Error getting initial location:', error);
    log('GPS_INITIAL_FIX_ERROR', { error: String(error) });
    return null;
  }
}
