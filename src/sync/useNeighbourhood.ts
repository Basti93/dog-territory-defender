import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { ApiGift, CoopWeekResponse, NearbyItem } from './apiContract';
import { linesAboutBot, NeighbourNote, resolveNeighbourNote } from './householdEvents';
import { NeighbourhoodActions, unopenedGifts } from './neighbourhood';
import { getNeighbourhood, subscribeNeighbourhood } from './neighbourhoodStore';

export interface Neighbourhood {
  nearby: NearbyItem[];
  /** The one neighbour note for the fence (newest line within 48 h), or null. */
  note: NeighbourNote | null;
  /** The last two worded lines about one dog, for its profile card. */
  linesFor: (botId: string) => string[];
  /** Parcels waiting at the mailbox. */
  unopenedGifts: ApiGift[];
  /** The Viertel-Runde, only while it is active. */
  coop: CoopWeekResponse | null;
  openGift: (gift: ApiGift) => Promise<boolean>;
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
  return { nearby, note, linesFor, unopenedGifts: unopened, coop: coop && coop.active ? coop : null, openGift };
}
