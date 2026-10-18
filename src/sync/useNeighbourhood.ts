import { useCallback, useEffect, useMemo, useState } from 'react';

import type { NeighbourLineEntry } from '../storage/SyncRepository';
import type { ApiGift, CoopWeekResponse, NearbyItem } from './apiContract';
import { linesAboutBot, NeighbourNote, resolveNeighbourNote } from './householdEvents';
import { NeighbourhoodSource, unopenedGifts } from './neighbourhood';
import { useNearby } from './useNearby';

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
 * Neighbour state for one screen. Lines, gifts and the co-op week are (re)read on mount and whenever the nearby
 * cache is replaced (the sync engine does that on the first sync of a launch and whenever neighbour events arrive).
 * `scope: 'lines'` skips the gifts and co-op requests (the map only needs the lines). `source` omitted (not joined /
 * tests) = everything empty.
 */
export function useNeighbourhood(
  source: NeighbourhoodSource | undefined,
  scope: 'lines' | 'all' = 'all',
  now: () => number = Date.now
): Neighbourhood {
  const nearby = useNearby();
  const [lines, setLines] = useState<NeighbourLineEntry[]>([]);
  const [gifts, setGifts] = useState<ApiGift[]>([]);
  const [coop, setCoop] = useState<CoopWeekResponse | null>(null);

  useEffect(() => {
    if (!source) return;
    let alive = true;
    source.neighbourLines().then((v) => alive && setLines(v)).catch(() => undefined);
    if (scope === 'all') {
      source.listGifts().then((v) => alive && setGifts(v)).catch(() => undefined);
      source.coopWeek().then((v) => alive && setCoop(v)).catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [source, nearby, scope]);

  const note = useMemo(() => resolveNeighbourNote(lines, now()), [lines, now]);
  const linesFor = useCallback((botId: string) => linesAboutBot(lines, botId, 2), [lines]);
  const openGift = useCallback(
    async (gift: ApiGift) => {
      if (!source) return false;
      const ok = await source.openGift(gift.id).catch(() => false);
      if (ok) setGifts((prev) => prev.map((g) => (g.id === gift.id ? { ...g, openedAt: now() } : g)));
      return ok;
    },
    [source, now]
  );

  return { nearby, note, linesFor, unopenedGifts: unopenedGifts(gifts), coop: coop && coop.active ? coop : null, openGift };
}
