import * as Location from 'expo-location';
import { Location as LocationType } from '../types';

export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      await Location.requestBackgroundPermissionsAsync();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Location permission error:', error);
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
        callback({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: position.timestamp,
        });
      }
    );
    return subscription;
  } catch (error) {
    console.error('Error watching location:', error);
    return null;
  }
}

export async function getInitialLocation(): Promise<LocationType | null> {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timestamp: position.timestamp,
    };
  } catch (error) {
    console.error('Error getting initial location:', error);
    return null;
  }
}
