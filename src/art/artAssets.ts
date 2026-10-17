import type { ImageSourcePropType } from 'react-native';

// Registry of pre-rendered 3D sprites (see openspec/changes/buddy-comes-alive/design.md, Decision 12).
// Generation checklist: assets/art/README.md.

export type BuildingId = 'doghouse' | 'bakery' | 'garden';
export type BuildingLevel = 1 | 2 | 3;

export type ArtKey =
  | `${BuildingId}-${BuildingLevel}`
  | 'yard-ground'
  | 'yard-ground-wide'
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
export const artAssets: Partial<Record<ArtKey, ImageSourcePropType>> = {
  'doghouse-1': require('../../assets/art/doghouse-1.png'),
  'doghouse-2': require('../../assets/art/doghouse-2.png'),
  'doghouse-3': require('../../assets/art/doghouse-3.png'),
  'bakery-1': require('../../assets/art/bakery-1.png'),
  'bakery-2': require('../../assets/art/bakery-2.png'),
  'bakery-3': require('../../assets/art/bakery-3.png'),
  'garden-1': require('../../assets/art/garden-1.png'),
  'garden-2': require('../../assets/art/garden-2.png'),
  'garden-3': require('../../assets/art/garden-3.png'),
  'yard-ground': require('../../assets/art/yard-ground.png'),
  'yard-ground-wide': require('../../assets/art/yard-ground-wide.png'),
  'icon-treat': require('../../assets/art/icon-treat.png'),
  'icon-paw': require('../../assets/art/icon-paw.png'),
  'icon-pin': require('../../assets/art/icon-pin.png'),
  'icon-badge': require('../../assets/art/icon-badge.png'),
  'icon-home': require('../../assets/art/icon-home.png'),
  'icon-settings': require('../../assets/art/icon-settings.png'),
  'icon-walks': require('../../assets/art/icon-walks.png'),
  'icon-den': require('../../assets/art/icon-den.png'),
  'doorstep-sky': require('../../assets/art/doorstep-sky.png'),
  'celebration-burst': require('../../assets/art/celebration-burst.png'),
};

export function hasArt(key: ArtKey): boolean {
  return artAssets[key] !== undefined;
}

// Returns the sprite if it exists, otherwise the caller's placeholder.
export function artOr<T>(key: ArtKey, fallback: T): ImageSourcePropType | T {
  return artAssets[key] ?? fallback;
}
