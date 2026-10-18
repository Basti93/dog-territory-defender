import { useCallback, useEffect, useMemo, useState } from 'react';

import type { TerritoryRepository } from '../storage/TerritoryRepository';
import type { WalkRepository } from '../storage/WalkRepository';
import { buildPostcards, pickFavouriteId, type PostcardEntry } from './postcards';

export interface PostcardsData {
  loaded: boolean;
  /** Every postcard, newest first. */
  cards: PostcardEntry[];
  /** Buddy's favourite among them (gets the paw stamp), or null. */
  favouriteId: string | null;
  /** The card's walk was deleted elsewhere (the Album's "take away"): drop it from the list without a reload. */
  forget: (id: string) => void;
}

const EMPTY: PostcardEntry[] = [];

/**
 * Loads the walks and builds the postcards (see postcards.ts: derived, never stored). Reloads when `refreshKey`
 * changes, e.g. after a walk was finished. The bench and the Album each use their own instance.
 */
export function usePostcards({
  walkRepository,
  territoryRepository,
  refreshKey,
  recentWalks,
}: {
  walkRepository: WalkRepository;
  territoryRepository?: TerritoryRepository;
  refreshKey?: number | string;
  /**
   * Read only the N newest walks (a cheap query) instead of every walk with all its fixes. For the bench, which shows
   * the newest few cards on every scene mount; the paw stamp is then picked among these N walks, not the whole Album.
   * Leave unset for the Album (all cards).
   */
  recentWalks?: number;
}): PostcardsData {
  const [state, setState] = useState<{ loaded: boolean; cards: PostcardEntry[] }>({ loaded: false, cards: EMPTY });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [walks, territories] = await Promise.all([recentWalks === undefined ? walkRepository.getWalks() : walkRepository.getRecentWalks(recentWalks), territoryRepository ? territoryRepository.getTerritories() : Promise.resolve([])]);
      if (alive) setState({ loaded: true, cards: buildPostcards(walks, territories) });
    })().catch(() => {
      if (alive) setState((prev) => (prev.loaded ? prev : { loaded: true, cards: EMPTY }));
    });
    return () => {
      alive = false;
    };
  }, [walkRepository, territoryRepository, refreshKey, recentWalks]);

  const forget = useCallback((id: string) => setState((prev) => ({ ...prev, cards: prev.cards.filter((c) => c.id !== id) })), []);

  const favouriteId = useMemo(() => pickFavouriteId(state.cards), [state.cards]);
  return { loaded: state.loaded, cards: state.cards, favouriteId, forget };
}
