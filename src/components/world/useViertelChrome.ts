import { useEffect, useMemo, useState } from 'react';

import { useLocale } from '../../i18n';
import { Cell } from '../../storage/HomeRangeRepository';
import type { CornerRepository, StoredCorner } from '../../storage/CornerRepository';
import { Territory } from '../../storage/TerritoryRepository';
import { HomeRangeRepository } from '../../storage/HomeRangeRepository';
import { TerritoryRepository } from '../../storage/TerritoryRepository';
import { WalkRepository } from '../../storage/WalkRepository';
import { resolveCorners } from '../../utils/cornerDetection';
import { cornerDisplayName } from '../../utils/cornerName';
import { streetsKnown } from '../../utils/grid';
import { lastKnownCoords } from '../../utils/lastKnownLocation';
import { territoryMass, territoryRate } from '../../economy/territoryEconomy';
import { DenEconomyRepository } from '../../storage/DenEconomyRepository';
import { evaluateSomewhereWildShared } from '../SomewhereWildCard';
import { emptyRangeNote, incomeLine, LatLon, MapNote, pickViertelNotes, statsSignParts, territoryHeading, TerritoryHeading, ViertelCorner } from './viertelChrome';

export interface ViertelChromeData {
  /** False until the first load finished: the signs stay out so they do not pop in half-filled. */
  loaded: boolean;
  /** Name of the territory of the latest walk; null = no territory yet. */
  territory: TerritoryHeading | null;
  /** "42 Runden", "31 Straßen", "3 Ecken": zero figures are left out; empty = no sign. */
  statsParts: string[];
  /** "Euer Boden bringt 0,4 Leckerlis/Std.": the territory income, always shown once there is any; null = no line. */
  incomeText: string | null;
  /** Handwritten notes for SHOW_NOTES (includes the chalk hint while the Range is empty). */
  notes: MapNote[];
  /** "Unsere Ecken" for SHOW_CORNERS: the household's corners with their sign text (the stats sign counts the same list). */
  corners: ViertelCorner[];
  /** The Somewhere-Wild pin. */
  wildSpot: LatLon | null;
  /** Where an empty Viertel centres: the last walk's end or the last known device position; null = nowhere known. */
  fallbackCenter: LatLon | null;
  rangeEmpty: boolean;
}

const INITIAL: ViertelChromeData = { loaded: false, territory: null, statsParts: [], incomeText: null, notes: [], corners: [], wildSpot: null, fallbackCenter: null, rangeEmpty: false };

/** What one data load read: language-free. The texts (stats parts, notes, territory name) are derived from it per locale. */
interface LoadedViertel {
  now: number;
  cells: Cell[];
  closedWalks: number;
  territories: Territory[];
  /** Already resolved (never two within 150 m). */
  corners: StoredCorner[];
  lastWalkEnd: LatLon | null;
  wildSpot: LatLon | null;
  fallbackCenter: LatLon | null;
  /** Treats per hour the household's ground brings (0 = unknown). */
  incomeRate: number;
}

/** Pure: builds every text from the loaded data in the current language (t() reads the active locale). */
function deriveChrome(loaded: LoadedViertel): ViertelChromeData {
  const { now, cells, closedWalks, territories, corners, lastWalkEnd, wildSpot, fallbackCenter, incomeRate } = loaded;
  const rangeEmpty = cells.length === 0;
  const notes = pickViertelNotes({ cells, wildSpot, now });
  if (rangeEmpty && fallbackCenter) notes.push(emptyRangeNote(fallbackCenter));
  return {
    loaded: true,
    territory: territoryHeading({ territories, cells, lastWalkEnd, now }),
    // The household's corners, named or not: the sign counts them all, never compares.
    statsParts: statsSignParts({ walks: closedWalks, streets: streetsKnown(cells.length), corners: corners.length }),
    incomeText: incomeLine(incomeRate),
    notes,
    corners: corners.map((c) => ({ id: c.id, name: cornerDisplayName(c), ix: c.ix, iy: c.iy })),
    wildSpot,
    fallbackCenter,
    rangeEmpty,
  };
}

interface Options {
  homeRangeRepository: HomeRangeRepository;
  walkRepository: WalkRepository;
  territoryRepository?: TerritoryRepository;
  /** For the income line (level + world mass). Omitted (tests) = no income line. */
  denEconomyRepository?: DenEconomyRepository;
  /** "Unsere Ecken". Omitted (tests) = no corners. */
  cornerRepository?: CornerRepository;
  dogName: string | null;
  /** Bump after the data changed (a walk was finished). */
  refreshKey?: number;
  /** Given (MapScreen: the card already resolved it) = used as is. `undefined` = resolved here (the scene). */
  wildSpot?: LatLon | null;
}

/**
 * Everything the Viertel signs and notes need, loaded once per mount and per `refreshKey`: the household's own numbers
 * (closed walks, streets known from the Range size, corners), the territory heading, the notes and the
 * centre for an empty Range. No timers; nothing is posted to a WebView from here. The data is read once, the texts are
 * rebuilt when the language switches (new `notes` array = MapView posts SHOW_NOTES again), without reading anything again.
 */
export function useViertelChrome({ homeRangeRepository, walkRepository, territoryRepository, denEconomyRepository, cornerRepository, dogName, refreshKey, wildSpot: givenWildSpot }: Options): ViertelChromeData {
  const [loaded, setLoaded] = useState<LoadedViertel | null>(null);
  const locale = useLocale();
  const wildKey = givenWildSpot === undefined ? 'own' : givenWildSpot ? `${givenWildSpot.latitude},${givenWildSpot.longitude}` : 'none';

  useEffect(() => {
    let alive = true;
    (async () => {
      const now = Date.now();
      const [cells, closedWalks, lastWalkEnd, territories, storedCorners] = await Promise.all([
        homeRangeRepository.getCells(),
        walkRepository.countClosedWalks(),
        walkRepository.getLastWalkEnd(),
        territoryRepository ? territoryRepository.getTerritories() : Promise.resolve([]),
        cornerRepository ? cornerRepository.getCorners().catch((): StoredCorner[] => []) : Promise.resolve([] as StoredCorner[]),
      ]);
      const corners = resolveCorners(storedCorners);
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
      let incomeRate = 0;
      if (denEconomyRepository) {
        try {
          const mass = await homeRangeRepository.getWorldMass();
          incomeRate = territoryRate(territoryMass(mass.cellCount, mass.visitsSum), (await denEconomyRepository.getState()).level);
        } catch {
          incomeRate = 0; // cosmetic: no income line
        }
      }
      const rangeEmpty = cells.length === 0;
      let fallbackCenter: LatLon | null = null;
      if (rangeEmpty) {
        fallbackCenter = lastWalkEnd ?? (await lastKnownCoords());
      }
      if (!alive) return;
      setLoaded({ now, cells, closedWalks, territories, corners, lastWalkEnd, wildSpot: wild, fallbackCenter, incomeRate });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
    // givenWildSpot is tracked through wildKey (an object prop would re-run on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeRangeRepository, walkRepository, territoryRepository, denEconomyRepository, cornerRepository, dogName, refreshKey, wildKey]);

  // `locale` is a dependency on purpose: deriveChrome calls t(), which reads the active language.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (loaded ? deriveChrome(loaded) : INITIAL), [loaded, locale]);
}
