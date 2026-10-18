// What the world scene, the map and the mailbox list need from the Nachbarhunde (slice M3): a small read/open
// interface (implemented by the sync engine, faked in tests) and the pure wording helpers. No React here.
// Tone (game-master): warm, no comparison numbers, never "you're behind".

import { t } from '../i18n';
import type { NeighbourLineEntry } from '../storage/SyncRepository';
import type { ApiGift, CoopWeekResponse } from './apiContract';

/** Implemented by SyncEngine. Every method resolves quietly: not joined, offline or neighbours off just means "nothing". */
export interface NeighbourhoodSource {
  /** The stored neighbour lines (newest first). */
  neighbourLines(): Promise<NeighbourLineEntry[]>;
  /** All gifts, newest first. `[]` when not joined or on any failure. */
  listGifts(): Promise<ApiGift[]>;
  /** Opens a gift (`gift.open`) and applies the server's Den state. false = it did not work this time (try again later). */
  openGift(giftId: string): Promise<boolean>;
  /** null when not joined, offline or on any failure. */
  coopWeek(): Promise<CoopWeekResponse | null>;
}

export const unopenedGifts = (gifts: ApiGift[]): ApiGift[] => gifts.filter((g) => g.openedAt === null);

const hasCopy = (key: string): boolean => t(key) !== key;

/** What is in the parcel, by name ("Stock aus Eiche", "ein paar Leckerlis"). */
export function giftThing(gift: ApiGift): string {
  if (gift.cosmeticId) {
    const key = `neighbours.cosmetic.${gift.cosmeticId}`;
    return hasCopy(key) ? t(key) : t('neighbours.cosmetic.unknown');
  }
  return t('neighbours.gift.treatsOnly');
}

/** The gentle line after opening: reuses the matching neighbour line (stick, collar, sock) so the words stay game-master's. */
export function giftOpenedLine(gift: ApiGift): string {
  const vars = { bot: gift.botName };
  const id = gift.cosmeticId ?? '';
  if (id.startsWith('stick-')) return t('neighbours.line.stickLeft', vars);
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
