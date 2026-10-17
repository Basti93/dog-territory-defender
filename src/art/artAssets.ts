import type { ImageSourcePropType } from 'react-native';

// Registry of pre-rendered 3D sprites (see openspec/changes/buddy-comes-alive/design.md, Decision 12).
// Generation checklist: assets/art/README.md.

export type BuildingId = 'doghouse' | 'bakery' | 'garden';
export type BuildingLevel = 1 | 2 | 3;

export type ArtKey =
  | `${BuildingId}-${BuildingLevel}`
  | 'yard-ground'
  | 'icon-treat'
  | 'icon-paw'
  | 'icon-pin'
  | 'icon-badge'
  | 'icon-home'
  | 'icon-settings'
  | 'icon-walks'
  | 'icon-den'
  | 'doorstep-sky'
  | 'celebration-burst';

export function buildingArt(building: BuildingId, level: BuildingLevel): ArtKey {
  return `${building}-${level}`;
}

// Explicitly edited map. Do NOT require() files that do not exist yet:
// Metro fails at bundle time on a missing file.
// When a PNG lands in assets/art/, add a line, for example:
//   'doghouse-1': require('../../assets/art/doghouse-1.png'),
export const artAssets: Partial<Record<ArtKey, ImageSourcePropType>> = {};

export function hasArt(key: ArtKey): boolean {
  return artAssets[key] !== undefined;
}

// Returns the sprite if it exists, otherwise the caller's placeholder.
export function artOr<T>(key: ArtKey, fallback: T): ImageSourcePropType | T {
  return artAssets[key] ?? fallback;
}
