import type { ImageSourcePropType } from 'react-native';

import { artOr, type NeighbourPose } from '../art/artAssets';
import { STICK_DOGS, type StickDogId } from '../economy/sticks';
import type { StoredWalk } from '../storage/WalkRepository';

// Who is on a postcard besides the trail: our dog (Buddy) and up to two neighbour dogs met on the walk.

export const MAX_MET_ON_STORED_WALK = 3;
export const MAX_NEIGHBOURS_ON_CARD = 2;

const isKnownDog = (id: string): id is StickDogId => STICK_DOGS.some((d) => d.id === id);

/** The met neighbour ids of a stored walk: known dogs only, no repeats, at most 3 (an unknown id from a newer server is dropped). */
export function metNeighboursOf(walk: Pick<StoredWalk, 'metNeighbourIds'>): StickDogId[] {
  const seen = new Set<StickDogId>();
  for (const id of walk.metNeighbourIds ?? []) if (isKnownDog(id)) seen.add(id);
  return Array.from(seen).slice(0, MAX_MET_ON_STORED_WALK);
}

/** The dog's name for the "met" lines ({name}); empty string when there is none. */
export function neighbourName(id: string | undefined): string {
  return STICK_DOGS.find((d) => d.id === id)?.name ?? '';
}

export interface NeighbourOnCard {
  id: StickDogId;
  name: string;
  pose: NeighbourPose;
}

/** Up to two neighbours for the card, in meeting order; the first trots toward us, the second sits, so they never look copied. */
export function neighboursOnCard(metIds: readonly string[]): NeighbourOnCard[] {
  return metIds
    .filter(isKnownDog)
    .slice(0, MAX_NEIGHBOURS_ON_CARD)
    .map((id, i) => ({ id, name: neighbourName(id), pose: i === 0 ? 'trot' : 'sit' }));
}

export function neighbourPortrait(dog: StickDogId, pose: NeighbourPose): ImageSourcePropType | null {
  return artOr(`dog-${dog}-${pose}`, null);
}

/**
 * Our dog's clay portrait for a postcard. Null until the AI portrait exists (dog-photo plan, phase 4): the card then
 * shows the Buddy skin from the stored look. The ONE place the portrait slots in.
 */
export function ourDogPortrait(): ImageSourcePropType | null {
  return null;
}
