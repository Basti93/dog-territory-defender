import { useEffect, useState } from 'react';

import { HomeRangeRepository } from '../../storage/HomeRangeRepository';
import { TerritoryRepository } from '../../storage/TerritoryRepository';
import { WalkRepository } from '../../storage/WalkRepository';
import { streetsKnown } from '../../utils/grid';
import { lastKnownCoords } from '../../utils/lastKnownLocation';
import { evaluateSomewhereWildShared } from '../SomewhereWildCard';
import { emptyRangeNote, LatLon, MapNote, pickViertelNotes, statsSignParts, territoryHeading, TerritoryHeading } from './viertelChrome';

export interface ViertelChromeData {
  /** False until the first load finished: the signs stay out so they do not pop in half-filled. */
  loaded: boolean;
  /** Name + character title of the territory of the latest walk; null = no territory yet. */
  territory: TerritoryHeading | null;
  /** "42 Runden", "31 Straßen", "3 Ecken": zero figures are left out; empty = no sign. */
  statsParts: string[];
  /** Handwritten notes for SHOW_NOTES (includes the chalk hint while the Range is empty). */
  notes: MapNote[];
  /** The Somewhere-Wild pin. */
  wildSpot: LatLon | null;
  /** Where an empty Viertel centres: the last walk's end or the last known device position; null = nowhere known. */
  fallbackCenter: LatLon | null;
  rangeEmpty: boolean;
}

const INITIAL: ViertelChromeData = { loaded: false, territory: null, statsParts: [], notes: [], wildSpot: null, fallbackCenter: null, rangeEmpty: false };

interface Options {
  homeRangeRepository: HomeRangeRepository;
  walkRepository: WalkRepository;
  territoryRepository?: TerritoryRepository;
  dogName: string | null;
  /** Bump after the data changed (a walk was finished). */
  refreshKey?: number;
  /** Given (MapScreen: the card already resolved it) = used as is. `undefined` = resolved here (the scene). */
  wildSpot?: LatLon | null;
}

/**
 * Everything the Viertel signs and notes need, loaded once per mount and per `refreshKey`: the household's own numbers
 * (closed walks, streets known from the Range size, named corners = none yet), the territory heading, the notes and the
 * centre for an empty Range. No timers; nothing is posted to a WebView from here.
 */
export function useViertelChrome({ homeRangeRepository, walkRepository, territoryRepository, dogName, refreshKey, wildSpot: givenWildSpot }: Options): ViertelChromeData {
  const [data, setData] = useState<ViertelChromeData>(INITIAL);
  const wildKey = givenWildSpot === undefined ? 'own' : givenWildSpot ? `${givenWildSpot.latitude},${givenWildSpot.longitude}` : 'none';

  useEffect(() => {
    let alive = true;
    (async () => {
      const now = Date.now();
      const [cells, closedWalks, lastWalkEnd, territories] = await Promise.all([
        homeRangeRepository.getCells(),
        walkRepository.countClosedWalks(),
        walkRepository.getLastWalkEnd(),
        territoryRepository ? territoryRepository.getTerritories() : Promise.resolve([]),
      ]);
      let wild: LatLon | null;
      if (givenWildSpot !== undefined) {
        wild = givenWildSpot;
      } else {
        try {
          const evaluated = await evaluateSomewhereWildShared({ homeRangeRepository, walkRepository, dogName, now, territoryRepository }, refreshKey ?? 0);
          wild = evaluated.card?.spot ?? null;
        } catch {
          wild = null; // offline lookups etc.: no pin, no note
        }
      }
      const rangeEmpty = cells.length === 0;
      let fallbackCenter: LatLon | null = null;
      if (rangeEmpty) {
        fallbackCenter = lastWalkEnd ?? (await lastKnownCoords());
      }
      if (!alive) return;
      const notes = pickViertelNotes({ cells, wildSpot: wild, now });
      if (rangeEmpty && fallbackCenter) notes.push(emptyRangeNote(fallbackCenter));
      setData({
        loaded: true,
        territory: territoryHeading({ territories, cells, lastWalkEnd, now }),
        // corners: the named-corner data model does not exist yet (SHOW_CORNERS is scaffolding), so that part stays hidden.
        statsParts: statsSignParts({ walks: closedWalks, streets: streetsKnown(cells.length), corners: 0 }),
        notes,
        wildSpot: wild,
        fallbackCenter,
        rangeEmpty,
      });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
    // givenWildSpot is tracked through wildKey (an object prop would re-run on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeRangeRepository, walkRepository, territoryRepository, dogName, refreshKey, wildKey]);

  return data;
}
