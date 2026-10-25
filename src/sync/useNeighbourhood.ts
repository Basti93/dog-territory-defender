import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { ApiGift, CoopWeekResponse, NearbyItem } from './apiContract';
import type { NeighbourLineEntry } from '../storage/SyncRepository';
import { linesAboutBot, NeighbourNote, resolveNeighbourNote } from './householdEvents';
import { NeighbourhoodActions, ShelfSlot, stickShelf, unopenedGifts } from './neighbourhood';
import { getNeighbourhood, subscribeNeighbourhood } from './neighbourhoodStore';

export interface Neighbourhood {
  nearby: NearbyItem[];
  /** The one neighbour note for the fence (newest line within 48 h), or null. */
  note: NeighbourNote | null;
  /** The stored neighbour lines (the mailbox words them as notes). */
  lines: NeighbourLineEntry[];
  /** The last two worded lines about one dog, for its profile card. */
  linesFor: (botId: string) => string[];
  /** Gifts lying in the Hof, newest first (sticks and the odd parcel). */
  unopenedGifts: ApiGift[];
  /** All gifts, newest first (the shelf and the "new on the shelf" check read them). */
  gifts: ApiGift[];
  /** The Stock-Regal: one slot per neighbour dog. */
  shelf: ShelfSlot[];
  /** The Viertel-Runde, only while it is active. */
  coop: CoopWeekResponse | null;
  openGift: (gift: ApiGift) => Promise<boolean | 'gone'>;
}

/**
 * Neighbour state for one screen: a pure read of the neighbourhood store, which the sync engine fills once per
 * change. Nothing is fetched here. `actions` omitted (not joined / tests) = opening a gift just says "not now".
 */
export function useNeighbourhood(actions: NeighbourhoodActions | undefined, now: () => number = Date.now): Neighbourhood {
  const { nearby, lines, gifts, coop } = useSyncExternalStore(subscribeNeighbourhood, getNeighbourhood);
  const note = useMemo(() => resolveNeighbourNote(lines, now()), [lines, now]);
  const linesFor = useCallback((botId: string) => linesAboutBot(lines, botId, 2), [lines]);
  const openGift = useCallback(async (gift: ApiGift) => (actions ? actions.openGift(gift.id).catch(() => false) : false), [actions]);
  const unopened = useMemo(() => unopenedGifts(gifts), [gifts]);
  const shelf = useMemo(() => stickShelf(gifts), [gifts]);
  return { nearby, lines, note, linesFor, unopenedGifts: unopened, gifts, shelf, coop: coop && coop.active ? coop : null, openGift };
}
