// The Stock-Regal (docs/specs/pack-collection.md "Stick shelf"): one stick per neighbour dog. PURE (no i18n, no React):
// shared by the server (which stick a dog leaves) and the app (shelf, yard pile). Nothing here is a balance number.

export const STICK_DOGS = [
  { id: 'momo', name: 'Momo' },
  { id: 'pfote', name: 'Pfote' },
  { id: 'bruno', name: 'Bruno' },
  { id: 'keks', name: 'Keks' },
  { id: 'lotte', name: 'Lotte' },
  { id: 'nebel', name: 'Nebel' },
] as const;

export type StickDogId = (typeof STICK_DOGS)[number]['id'];

export const stickIdFor = (dog: StickDogId): string => `stick-${dog}`;

const isStickDog = (id: string): id is StickDogId => STICK_DOGS.some((d) => d.id === id);

/**
 * Which dog's shelf slot a gift fills, or null if it is not a stick. New sticks are `stick-<dog>`. The two first-generation
 * ids (`stick-oak`, `stick-birch`, `stick-pfote`) have no dog in their name: they fall back to the dog that sent them
 * (`botName`), which for every stick given before the shelf was Pfote.
 */
export function stickDogOf(gift: { cosmeticId: string | null; botName: string }): StickDogId | null {
  const id = gift.cosmeticId;
  if (!id || !id.startsWith('stick-')) return null;
  const named = id.slice('stick-'.length);
  if (isStickDog(named)) return named;
  const sender = gift.botName.toLowerCase();
  return isStickDog(sender) ? sender : null;
}
