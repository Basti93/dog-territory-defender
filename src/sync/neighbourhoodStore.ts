// The one in-memory store behind everything the Nachbarhunde show (Track B): the dogs' dotted Ranges
// (GET /v1/nearby), the stored neighbour lines, the gift parcels and the Viertel-Runde week. The sync engine is the
// ONLY writer: it fetches once per change (first sync of a launch, neighbour events) and publishes here. Screens
// only read (useNeighbourhood / useNearby), so no screen refetches on its own. Deliberately not persisted: bots
// are simulated and refetched on every launch's first sync (the lines are persisted in sync state and re-published).

import type { NeighbourLineEntry } from '../storage/SyncRepository';
import type { ApiGift, CoopWeekResponse, NearbyItem } from './apiContract';

export interface NeighbourhoodState {
  nearby: NearbyItem[];
  /** Stored neighbour lines, newest first. */
  lines: NeighbourLineEntry[];
  /** All gifts, newest first. */
  gifts: ApiGift[];
  /** The Viertel-Runde week as the server sent it (callers treat `active: false` as "no sign"). */
  coop: CoopWeekResponse | null;
}

const EMPTY: NeighbourhoodState = { nearby: [], lines: [], gifts: [], coop: null };

let state: NeighbourhoodState = EMPTY;
const listeners = new Set<() => void>();

export const getNeighbourhood = (): NeighbourhoodState => state;

/** Replaces the given parts. A part that is the same value (reference) as before changes nothing and notifies nobody. */
export function setNeighbourhood(patch: Partial<NeighbourhoodState>): void {
  const next = { ...state, ...patch };
  if ((Object.keys(next) as Array<keyof NeighbourhoodState>).every((k) => next[k] === state[k])) return;
  state = next;
  listeners.forEach((l) => l());
}

export function subscribeNeighbourhood(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Back to nothing (left the household, tests). */
export function resetNeighbourhood(): void {
  if (state === EMPTY) return;
  state = EMPTY;
  listeners.forEach((l) => l());
}

export const getNearby = (): NearbyItem[] => state.nearby;
export const setNearby = (nearby: NearbyItem[]): void => setNeighbourhood({ nearby });

const sameLines = (a: NeighbourLineEntry[], b: NeighbourLineEntry[]): boolean => a.length === b.length && a.every((e, i) => e.seq === b[i].seq);

/** Lines come from storage as a fresh array every time: only replace them when they really changed. */
export function setNeighbourLines(lines: NeighbourLineEntry[]): void {
  if (!sameLines(state.lines, lines)) setNeighbourhood({ lines });
}
