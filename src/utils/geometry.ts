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

export function canCloseWalk(locations: Location[]): boolean {
  if (locations.length < 10) return false;

  const first = locations[0];
  const last = locations[locations.length - 1];

  const distance = getDistance(first.latitude, first.longitude, last.latitude, last.longitude);
  return distance < 20;
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
