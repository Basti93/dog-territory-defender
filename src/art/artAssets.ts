import type { ImageSourcePropType } from 'react-native';

// Registry of pre-rendered 3D sprites (see docs/decisions/buddy-comes-alive/design.md, Decision 12).
// Generation checklist: assets/art/README.md.

export type BuildingId = 'doghouse' | 'bakery' | 'garden';
export type BuildingLevel = 1 | 2 | 3 | 4 | 5;
export const BUILDING_LEVELS: readonly BuildingLevel[] = [1, 2, 3, 4, 5];

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
  | 'celebration-burst'
  // Yard scene props (redesign step 1).
  | 'fence-segment'
  | 'fence-post-end'
  | 'gate-closed'
  | 'gate-open'
  | 'bench'
  | 'bench-empty'
  | 'bowl'
  | 'bowl-empty'
  | 'sign-small'
  | 'sign-medium'
  | 'sign-wide'
  | 'doormat'
  | 'pennant'
  | 'postcard-blank'
  // Wild Extras props (weird streak). Registry lines land with the PNGs; until then YardExtras draws fallbacks.
  | 'prop-ufo'
  | 'prop-beam'
  | 'prop-comet-bone'
  | 'prop-duck-party'
  | 'prop-squirrel-raincoat'
  | 'prop-mailbox'
  | 'prop-sock'
  | 'prop-gnome'
  | 'prop-cloud-tea'
  | 'prop-moon-cheese'
  | 'prop-firefly'
  | 'prop-lightbulb'
  | 'prop-question';

export function buildingArt(building: BuildingId, level: BuildingLevel): ArtKey {
  return `${building}-${level}`;
}

/**
 * The building art to actually draw: `stage`, or the highest lower stage that is registered. Stages 4 and 5
 * ship after the code, so a high-level building shows its newest existing art instead of a grey placeholder.
 */
export function buildingArtOrBest(building: BuildingId, stage: BuildingLevel): ArtKey {
  for (let s = stage; s > 1; s--) {
    const key = buildingArt(building, s as BuildingLevel);
    if (hasArt(key)) return key;
  }
  return buildingArt(building, 1);
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
  'doghouse-4': require('../../assets/art/doghouse-4.png'),
  'doghouse-5': require('../../assets/art/doghouse-5.png'),
  'bakery-4': require('../../assets/art/bakery-4.png'),
  'bakery-5': require('../../assets/art/bakery-5.png'),
  'garden-4': require('../../assets/art/garden-4.png'),
  'garden-5': require('../../assets/art/garden-5.png'),
  'prop-ufo': require('../../assets/art/prop-ufo.png'),
  'prop-beam': require('../../assets/art/prop-beam.png'),
  'prop-comet-bone': require('../../assets/art/prop-comet-bone.png'),
  'prop-duck-party': require('../../assets/art/prop-duck-party.png'),
  'prop-squirrel-raincoat': require('../../assets/art/prop-squirrel-raincoat.png'),
  'prop-mailbox': require('../../assets/art/prop-mailbox.png'),
  'prop-sock': require('../../assets/art/prop-sock.png'),
  'prop-gnome': require('../../assets/art/prop-gnome.png'),
  'prop-cloud-tea': require('../../assets/art/prop-cloud-tea.png'),
  'prop-moon-cheese': require('../../assets/art/prop-moon-cheese.png'),
  'prop-firefly': require('../../assets/art/prop-firefly.png'),
  'prop-lightbulb': require('../../assets/art/prop-lightbulb.png'),
  'prop-question': require('../../assets/art/prop-question.png'),
  'fence-segment': require('../../assets/art/fence-segment.png'),
  'fence-post-end': require('../../assets/art/fence-post-end.png'),
  'gate-closed': require('../../assets/art/gate-closed.png'),
  'gate-open': require('../../assets/art/gate-open.png'),
  'bench': require('../../assets/art/bench.png'),
  'bench-empty': require('../../assets/art/bench-empty.png'),
  'bowl': require('../../assets/art/bowl.png'),
  'bowl-empty': require('../../assets/art/bowl-empty.png'),
  'sign-small': require('../../assets/art/sign-small.png'),
  'sign-medium': require('../../assets/art/sign-medium.png'),
  'sign-wide': require('../../assets/art/sign-wide.png'),
  'doormat': require('../../assets/art/doormat.png'),
  'pennant': require('../../assets/art/pennant.png'),
  'postcard-blank': require('../../assets/art/postcard-blank.png'),
};

export function hasArt(key: ArtKey): boolean {
  return artAssets[key] !== undefined;
}

// Returns the sprite if it exists, otherwise the caller's placeholder.
export function artOr<T>(key: ArtKey, fallback: T): ImageSourcePropType | T {
  return artAssets[key] ?? fallback;
}
