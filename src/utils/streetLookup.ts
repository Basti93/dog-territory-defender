// Street-name (and, for the New Ground state, real-location) resolution for
// the "Somewhere Wild" card — see docs/decisions/somewhere-wild.md
// Decision 3 (wild-cluster label, with its bounded walk-history fallback)
// and Decision 4 (New Ground label, reusing the same walk-history scan
// since the persisted event carries no location of its own — see
// resolveNewGroundSpot's doc comment). Wraps expo-location's own OS-backed
// geocoder (Decision 5) — no new dependency, no backend, no API key.

import * as ExpoLocation from 'expo-location';

import { dogDisplayName } from '../economy/denEconomy';
import { getDistance } from './geometry';
import { cellCentre, cellForLocation, CellId, paintedCells, parseCellKey } from './grid';
import { NewGroundEvent } from '../storage/HomeRangeRepository';
import { WalkRepository } from '../storage/WalkRepository';
import { Location as GpsLocation } from '../types';
import { WildCluster } from './wildSpot';
import { t } from '../i18n';

/** Recent walk history is scanned at most this deep (nearest-in-time first) before giving up — design.md Decision 3 Fix 1's bound on the fallback scan's cost. */
const MAX_FALLBACK_WALKS_SCANNED = 20;

interface CellBounds {
  minIx: number;
  maxIx: number;
  minIy: number;
  maxIy: number;
}

function addressToLabel(address: ExpoLocation.LocationGeocodedAddress): string | null {
  // "A real place name" in priority order — street is the common case this
  // whole feature is built around; district/city are reasonable fallbacks
  // when a geocoder resolves an area without a street-level result.
  return address.street || address.district || address.city || null;
}

/**
 * Reverse-geocodes a single point and returns the first usable label, or
 * `null` if the geocoder returns nothing, throws (device-fragmentation risk
 * — see design.md Decision 5), or returns no usable address field. Never
 * throws — a geocoding failure is exactly the "render nothing this cycle"
 * path (design.md Decision 3 Fix 2), not an error to propagate.
 */
export async function resolveLabelForPoint(latitude: number, longitude: number): Promise<string | null> {
  try {
    const results = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
    for (const address of results) {
      const label = addressToLabel(address);
      if (label) return label;
    }
    return null;
  } catch {
    return null;
  }
}

/** In-memory cache — a resolved (or failed) label isn't re-fetched more than once per session for the same key (anchor cell id, or a New Ground event's occurredAt). Persisted caching is optional polish per design.md Decision 5, not required for correctness. */
const labelCache = new Map<string, string | null>();

async function resolveCached(cacheKey: string, resolve: () => Promise<string | null>): Promise<string | null> {
  if (labelCache.has(cacheKey)) {
    return labelCache.get(cacheKey) ?? null;
  }
  const label = await resolve();
  labelCache.set(cacheKey, label);
  return label;
}

function rectsOverlap(a: CellBounds, b: CellBounds): boolean {
  return a.minIx <= b.maxIx && a.maxIx >= b.minIx && a.minIy <= b.maxIy && a.maxIy >= b.minIy;
}

function boundsForCellIds(cellIds: Iterable<CellId>): CellBounds {
  const bounds: CellBounds = { minIx: Infinity, maxIx: -Infinity, minIy: Infinity, maxIy: -Infinity };
  for (const id of cellIds) {
    const { ix, iy } = parseCellKey(id);
    bounds.minIx = Math.min(bounds.minIx, ix);
    bounds.maxIx = Math.max(bounds.maxIx, ix);
    bounds.minIy = Math.min(bounds.minIy, iy);
    bounds.maxIy = Math.max(bounds.maxIy, iy);
  }
  return bounds;
}

/**
 * Bounded scan of recent walk history (design.md Decision 3 Fix 1) for a
 * real recorded GPS location belonging to a walk whose path overlaps
 * `cellIds` — cheapest checks first (a bounding-box pre-filter before the
 * much more expensive paintedCells() call), nearest-in-time first, capped
 * at MAX_FALLBACK_WALKS_SCANNED. Returns the matching walk's own location
 * nearest `referenceLat`/`referenceLon`, or `null` if nothing overlaps.
 * Shared by both the wild-cluster fallback and the New Ground spot lookup
 * below — same "find a real point that's known to sit on this ground"
 * problem in both cases.
 */
async function findOverlappingWalkLocation(
  cellIds: ReadonlySet<CellId>,
  bounds: CellBounds,
  walkRepository: WalkRepository,
  referenceLat: number,
  referenceLon: number
): Promise<GpsLocation | null> {
  const allWalks = await walkRepository.getWalks(); // already most-recent-first (WalkRepository's own contract)

  const candidates = allWalks
    .filter((w) => w.locations.length > 0)
    .filter((w) => {
      let minIx = Infinity;
      let maxIx = -Infinity;
      let minIy = Infinity;
      let maxIy = -Infinity;
      for (const loc of w.locations) {
        const { ix, iy } = cellForLocation(loc.latitude, loc.longitude);
        minIx = Math.min(minIx, ix);
        maxIx = Math.max(maxIx, ix);
        minIy = Math.min(minIy, iy);
        maxIy = Math.max(maxIy, iy);
      }
      return rectsOverlap(bounds, { minIx, maxIx, minIy, maxIy });
    })
    .slice(0, MAX_FALLBACK_WALKS_SCANNED);

  for (const walk of candidates) {
    const walkCells = paintedCells(walk.locations);
    const overlaps = [...cellIds].some((id) => walkCells.has(id));
    if (!overlaps) continue;

    // The walk's own recorded location nearest the reference point — a real
    // GPS fix is more likely to sit exactly on a mapped street (or exactly
    // on the discovered ground) than an arbitrary cell centre is.
    let nearest = walk.locations[0];
    let nearestDistance = getDistance(nearest.latitude, nearest.longitude, referenceLat, referenceLon);
    for (const loc of walk.locations.slice(1)) {
      const distance = getDistance(loc.latitude, loc.longitude, referenceLat, referenceLon);
      if (distance < nearestDistance) {
        nearest = loc;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  return null;
}

/**
 * Resolves a place name for the wild-cluster card state. `null` means
 * "render nothing this cycle" (design.md Decision 3 Fix 2) — callers must
 * never substitute a placeholder string for this state; this state's copy
 * is meaningless without a real place name.
 */
export async function resolveWildClusterLabel(
  cluster: WildCluster,
  deps: { walkRepository: WalkRepository }
): Promise<string | null> {
  return resolveCached(cluster.anchorCellId, async () => {
    const [lat, lon] = cellCentre(cluster.anchor.ix, cluster.anchor.iy);
    const primary = await resolveLabelForPoint(lat, lon);
    if (primary) return primary;

    const fallbackLocation = await findOverlappingWalkLocation(
      cluster.cellIds,
      cluster.bounds,
      deps.walkRepository,
      lat,
      lon
    );
    if (!fallbackLocation) return null;
    return resolveLabelForPoint(fallbackLocation.latitude, fallbackLocation.longitude);
  });
}

export interface NewGroundSpot {
  location: GpsLocation;
  /** `null` means the geocoder didn't resolve a label — the New Ground card renders anyway with its "without place" template (design.md's card copy section), unlike the wild-cluster state. */
  label: string | null;
}

/**
 * Resolves a real location (and, if possible, a place name) for the New
 * Ground card state. The persisted NewGroundEvent (design.md Decision 4)
 * deliberately carries only `occurredAt`/`cellIds`, not a location — so
 * finding "a real GPS fix from the discovering walk" at read time (up to
 * 48h later) reuses the exact same bounded walk-history scan the
 * wild-cluster state's fallback uses, keyed on the event's own cell set.
 * In practice this almost always resolves on the first candidate: the
 * discovering walk was saved to WalkRepository moments after this event was
 * recorded, in the same Finish Walk call.
 *
 * Returns `null` (render nothing this cycle) only in the rare case where no
 * walk in recent history can be matched to this event at all — never a
 * marker/card with no real location behind it.
 */
export async function resolveNewGroundSpot(
  event: NewGroundEvent,
  walkRepository: WalkRepository
): Promise<NewGroundSpot | null> {
  const cellIds = new Set(event.cellIds);
  const bounds = boundsForCellIds(cellIds);
  if (!Number.isFinite(bounds.minIx)) return null; // defensive: an event with no cells at all

  const [refLat, refLon] = cellCentre(
    Math.round((bounds.minIx + bounds.maxIx) / 2),
    Math.round((bounds.minIy + bounds.maxIy) / 2)
  );

  const location = await findOverlappingWalkLocation(cellIds, bounds, walkRepository, refLat, refLon);
  if (!location) return null;

  const label = await resolveCached(`new-ground:${event.occurredAt}`, () =>
    resolveLabelForPoint(location.latitude, location.longitude)
  );
  return { location, label };
}

/**
 * Resolves a new Territory's name — docs/decisions/territories.md
 * Decision 5. Unlike the wild-cluster/New-Ground states above (which render
 * nothing on a geocoding failure — the fact they describe is optional and
 * re-evaluated later), a Territory MUST exist and be nameable the instant
 * it's born: the celebration beat needs a name for its copy, and the
 * territory needs one the moment it appears in the list. Never throws, and
 * never returns an empty string — always falls back to a placeholder name
 * rather than leaving a Territory unnamed.
 *
 * TODO(game-master copy pass): "{dog}'s New Range" is a placeholder fallback
 * per design.md Decision 5 / proposal.md's Open Questions — not final copy.
 */
export async function resolveTerritoryName(
  anchorLat: number,
  anchorLon: number,
  dogName: string | null
): Promise<string> {
  const dog = dogDisplayName(dogName);
  const place = await resolveLabelForPoint(anchorLat, anchorLon);
  if (place) {
    return t('territory.name.withPlace', { dog, place });
  }
  return t('territory.name.fallback', { dog });
}
