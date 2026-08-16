import { Location } from '../types';

const BASE_TIME = 1700000000000;

/**
 * ~12-point loop around a fixed point, ending within a few meters of the start —
 * satisfies canCloseWalk (>=10 points, start/end distance < 20m).
 */
export const mockClosedLoop: Location[] = [
  { latitude: 52.5, longitude: 13.4, timestamp: BASE_TIME + 0 },
  { latitude: 52.5, longitude: 13.400221, timestamp: BASE_TIME + 1000 },
  { latitude: 52.5, longitude: 13.400443, timestamp: BASE_TIME + 2000 },
  { latitude: 52.500135, longitude: 13.400443, timestamp: BASE_TIME + 3000 },
  { latitude: 52.500269, longitude: 13.400443, timestamp: BASE_TIME + 4000 },
  { latitude: 52.500269, longitude: 13.400221, timestamp: BASE_TIME + 5000 },
  { latitude: 52.500269, longitude: 13.4, timestamp: BASE_TIME + 6000 },
  { latitude: 52.500135, longitude: 13.4, timestamp: BASE_TIME + 7000 },
  { latitude: 52.500045, longitude: 13.4, timestamp: BASE_TIME + 8000 },
  { latitude: 52.5, longitude: 13.400044, timestamp: BASE_TIME + 9000 },
  { latitude: 52.5, longitude: 13.400015, timestamp: BASE_TIME + 10000 },
  { latitude: 52.5, longitude: 13.400007, timestamp: BASE_TIME + 11000 },
];

/**
 * 10 points walking in a straight line ~180m away from the start —
 * fails canCloseWalk on distance, not point count, so it exercises End Walk
 * rather than the point-count shortcut.
 */
export const mockOpenWalk: Location[] = [
  { latitude: 52.5, longitude: 13.4, timestamp: BASE_TIME + 0 },
  { latitude: 52.50018, longitude: 13.4, timestamp: BASE_TIME + 1000 },
  { latitude: 52.500359, longitude: 13.4, timestamp: BASE_TIME + 2000 },
  { latitude: 52.500539, longitude: 13.4, timestamp: BASE_TIME + 3000 },
  { latitude: 52.500719, longitude: 13.4, timestamp: BASE_TIME + 4000 },
  { latitude: 52.500898, longitude: 13.4, timestamp: BASE_TIME + 5000 },
  { latitude: 52.501078, longitude: 13.4, timestamp: BASE_TIME + 6000 },
  { latitude: 52.501258, longitude: 13.4, timestamp: BASE_TIME + 7000 },
  { latitude: 52.501437, longitude: 13.4, timestamp: BASE_TIME + 8000 },
  { latitude: 52.501617, longitude: 13.4, timestamp: BASE_TIME + 9000 },
];
