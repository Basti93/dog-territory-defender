import { Location, TerritoryPolygon } from '../types';

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function cumulativeDistance(locations: Location[]): number {
  let total = 0;
  for (let i = 1; i < locations.length; i++) {
    total += getDistance(
      locations[i - 1].latitude,
      locations[i - 1].longitude,
      locations[i].latitude,
      locations[i].longitude
    );
  }
  return total;
}

// Minimum closure radius regardless of GPS accuracy — real-walk testing showed
// even ~5m-accuracy fixes routinely miss a flat 20m threshold, since a walker's
// actual return point rarely lands exactly on the first recorded fix. See
// openspec/changes/gps-accuracy-aware-closure/design.md.
const MIN_CLOSURE_RADIUS_M = 100;
const CLOSURE_ACCURACY_MARGIN_M = 10;

export function canCloseWalk(locations: Location[]): boolean {
  if (locations.length < 10) return false;

  const first = locations[0];
  const last = locations[locations.length - 1];

  const closureRadius = Math.max(first.accuracy + last.accuracy + CLOSURE_ACCURACY_MARGIN_M, MIN_CLOSURE_RADIUS_M);
  const distance = getDistance(first.latitude, first.longitude, last.latitude, last.longitude);
  return distance < closureRadius;
}

export function calculatePolygonArea(coords: [number, number][]): number {
  if (coords.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const [lat1, lon1] = coords[i];
    const [lat2, lon2] = coords[(i + 1) % coords.length];
    area += lat1 * lon2 - lat2 * lon1;
  }

  return Math.abs(area) / 2 * 111000 * 111000;
}

export function locationsToPolygon(locations: Location[]): TerritoryPolygon | null {
  if (locations.length < 3) return null;

  const coords = locations.map((loc): [number, number] => [loc.latitude, loc.longitude]);
  return {
    coordinates: coords,
    area: calculatePolygonArea(coords),
  };
}
