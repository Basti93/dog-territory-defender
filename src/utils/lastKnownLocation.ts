import * as Location from 'expo-location';

/**
 * The device's last known position, only when location permission is already granted (never prompts, never starts a GPS
 * fix). Used to centre the empty Viertel on "around here". Null on any problem.
 */
export async function lastKnownCoords(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission?.status !== 'granted') return null;
    const position = await Location.getLastKnownPositionAsync();
    return position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : null;
  } catch {
    return null;
  }
}
