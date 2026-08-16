import * as Location from 'expo-location';
import { Location as LocationType } from '../types';
import { log } from './log';

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

export async function startWatchingLocation(
  callback: (location: LocationType) => void
): Promise<Location.LocationSubscription | null> {
  try {
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 2,
      },
      (position) => {
        log('GPS_UPDATE', {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          gpsTimestamp: position.timestamp,
        });
        callback({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: position.timestamp,
        });
      }
    );
    log('GPS_WATCH_STARTED');
    return subscription;
  } catch (error) {
    console.error('Error watching location:', error);
    log('GPS_WATCH_ERROR', { error: String(error) });
    return null;
  }
}

export async function getInitialLocation(): Promise<LocationType | null> {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    log('GPS_INITIAL_FIX', { lat: position.coords.latitude, lon: position.coords.longitude });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timestamp: position.timestamp,
    };
  } catch (error) {
    console.error('Error getting initial location:', error);
    log('GPS_INITIAL_FIX_ERROR', { error: String(error) });
    return null;
  }
}
