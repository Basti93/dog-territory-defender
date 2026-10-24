// What the world scene, the map and the Album's stick shelf need from the Nachbarhunde (slice M3): the one action seam
// (open a gift; reads go through neighbourhoodStore.ts) and the pure wording helpers. No React here.
// Tone (game-master): warm, no comparison numbers, never "you're behind".

import { t } from '../i18n';
import { STICK_DOGS, stickDogOf, type StickDogId } from '../economy/sticks';
import type { ApiGift, CoopWeekResponse } from './apiContract';

/** What a screen may ask of the neighbours (implemented by the sync engine, faked in tests). Reading is the neighbourhood store's job. */
export interface NeighbourhoodActions {
  /** Opens a gift (`gift.open`), applies the server's Den state and marks it opened in the store. false = it did not work this time (try again later); 'gone' = the server no longer knows the gift (already removed from the store). */
  openGift(giftId: string): Promise<boolean | 'gone'>;
}

export const unopenedGifts = (gifts: ApiGift[]): ApiGift[] => gifts.filter((g) => g.openedAt === null);

export interface ShelfSlot {
  id: StickDogId;
  name: string;
  collected: boolean;
}

/** The Stock-Regal: one slot per neighbour dog, filled once any stick of that dog was picked up (opened). Duplicates change nothing. */
export function stickShelf(gifts: ApiGift[]): ShelfSlot[] {
  const have = new Set(gifts.filter((g) => g.openedAt !== null).map(stickDogOf));
  return STICK_DOGS.map((d) => ({ id: d.id, name: d.name, collected: have.has(d.id) }));
}

/** True when picking up this gift puts a stick on an empty shelf slot (first stick of that dog). */
export function fillsShelfSlot(gift: ApiGift, gifts: ApiGift[]): boolean {
  const dog = stickDogOf(gift);
  return dog !== null && !stickShelf(gifts).find((s) => s.id === dog)?.collected;
}

/**
 * The calm line after Buddy picked a gift up. A stick says whose it is; the first stick of a dog adds where it hangs now.
 * Other gifts reuse the matching neighbour line (collar, sock) so the words stay game-master's.
 */
export function giftOpenedLine(gift: ApiGift, newOnShelf = false): string {
  const vars = { bot: gift.botName };
  const id = gift.cosmeticId ?? '';
  if (id.startsWith('stick-')) return t(newOnShelf ? 'neighbours.stick.lineNew' : 'neighbours.stick.line', vars);
  if (id.startsWith('collar-')) return t('neighbours.line.collarGift', vars);
  if (id.startsWith('sock-')) return t('neighbours.line.sockLeft', vars);
  if (!gift.cosmeticId && gift.sprinkleTreats) return t('neighbours.gift.openedTreats', vars);
  return t('neighbours.gift.openedOther', vars);
}

/** Text of the Viertel-Runde sign: one ratio, no split between people and dogs. Null while the co-op is not active. */
export function coopSignText(coop: CoopWeekResponse | null): string | null {
  if (!coop || !coop.active) return null;
  if (coop.completed) return t('neighbours.coop.done');
  const percent = Math.max(0, Math.min(100, Math.round(coop.ratio * 100)));
  return t('neighbours.coop.sign', { percent });
}
