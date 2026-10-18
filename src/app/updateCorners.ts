// "Unsere Ecken": finds the corners the walks on this phone make (own and the household's), stores the new ones and
// looks up the street for their auto-name. Detection is pure (utils/cornerDetection.ts) and replays every walk, so each
// phone ends up with the same ids; this file only does the reading, storing and the street lookup.

import type { CornerRepository, StoredCorner } from '../storage/CornerRepository';
import type { WalkRepository } from '../storage/WalkRepository';
import { cornerLatLon, detectCorners, type DetectedCorner } from '../utils/cornerDetection';
import { log } from '../utils/log';
import { resolveStreetForPoint } from '../utils/streetLookup';

export interface UpdateCornersDeps {
  walkRepository: WalkRepository;
  cornerRepository: CornerRepository;
  /** The street at a point; null when unknown. Defaults to the OS geocoder. */
  lookupStreet?: (latitude: number, longitude: number) => Promise<string | null>;
  /** How long the caller waits for the street lookups (the homecoming must not stall). A slower lookup still finishes in the background. */
  lookupWaitMs?: number;
}

export const DEFAULT_LOOKUP_WAIT_MS = 2500;
/** Corners without a street are retried this many at a time per run (offline phones do not hammer the geocoder). */
const STREET_RETRIES_PER_RUN = 3;


/**
 * Detects, stores and names. Returns the corners found by THIS run (the caller picks the one its walk made). Never
 * throws for a geocoder problem: the corner just keeps the neutral name until a later run finds the street.
 */
export async function updateCorners(deps: UpdateCornersDeps): Promise<DetectedCorner[]> {
  const { walkRepository, cornerRepository } = deps;
  const lookupStreet = deps.lookupStreet ?? resolveStreetForPoint;
  const [walks, known] = await Promise.all([walkRepository.getWalks(), cornerRepository.getCorners()]);
  const found = detectCorners(walks, known);
  if (found.length > 0) {
    await cornerRepository.addCorners(found);
    log('CORNERS_FOUND', { count: found.length, total: known.length + found.length });
  }

  const foundIds = new Set(found.map((c) => c.id));
  const missing: Array<{ id: string; ix: number; iy: number }> = [
    ...found,
    ...known.filter((c: StoredCorner) => c.street === null && c.name === null && !foundIds.has(c.id)).slice(-STREET_RETRIES_PER_RUN),
  ];
  const lookups = missing.map(async (c) => {
    const [lat, lon] = cornerLatLon(c);
    const street = await lookupStreet(lat, lon);
    if (street) await cornerRepository.setStreet(c.id, street);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const patience = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, deps.lookupWaitMs ?? DEFAULT_LOOKUP_WAIT_MS);
  });
  try {
    await Promise.race([Promise.allSettled(lookups), patience]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return found;
}
