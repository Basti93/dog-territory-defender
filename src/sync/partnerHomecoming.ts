// The queue behind the mini homecoming (M4 "Alex im Hof"). Two signals have to meet: the presence viewer saw a
// partner's walk end, and a `walk.added` for that same walk arrived through sync. Then "Alex und Buddy sind
// zurück" can play: beats 1 and 2 of the Heimkehr (the patch star, the treats into the bowl). The queue holds the
// requests in memory; whoever renders (App) decides WHEN one may play, so it never interrupts a walk in progress or
// the player's own homecoming and simply waits its turn.
//
// Late variant: when the partner's walk ended while this app was closed or in the background, the presence viewer never
// saw it end; the walk simply shows up in the next sync. `noteLateWalks` turns the newest such walk (within 48 h, not
// shown before, at most one per app open) into the same request. Shown walk ids are persisted so a walk never plays twice.

import type { PartnerWalkAdded } from './apply';

/** How long an ended presence waits for its walk to show up in sync before it is forgotten (silence, never an error). */
export const PENDING_TTL_MS = 5 * 60_000;
/** Sync is asked for the partner's walk at these delays after the presence ended (her phone uploads right after the last beat). */
export const SYNC_RETRY_DELAYS_MS = [2_000, 8_000, 20_000, 45_000, 90_000];
/** A partner walk older than this (by its start) is not worth a "they are back" moment any more. */
export const LATE_WINDOW_MS = 48 * 60 * 60_000;
/** Shown walk ids kept on the phone; a walk older than the window can never come back anyway. */
export const SHOWN_IDS_KEPT = 50;

/** Where the ids of already shown partner homecomings live (SettingsRepository). */
export interface ShownWalkStore {
  load(): Promise<string[]>;
  save(ids: string[]): Promise<void>;
}

export interface PartnerHomecomingRequest {
  walkId: string;
  /** Alex, as the household knows her. */
  name: string;
  treatsEarned: number;
  newGroundCellCount: number;
  distanceMeters: number;
  walkTime: number;
}

export interface PartnerHomecomingQueue {
  /** The presence viewer saw this walk end. Starts asking sync for the walk. */
  noteEnded(walk: { walkId: string; name: string }): void;
  /** Sync fetched these partner walks. Any that match an ended presence become requests. */
  noteWalksAdded(walks: PartnerWalkAdded[]): void;
  /**
   * Partner walks that arrived through sync, whether or not the presence viewer saw them end. The newest one that is
   * within 48 h, was not shown before, is not manual and fits this open's single late slot becomes a request.
   * Call it next to `noteWalksAdded` with the same list.
   */
  noteLateWalks(walks: PartnerWalkAdded[]): Promise<void>;
  /** The app came to the front again: a new open, so one more late homecoming may be queued. */
  noteForeground(): void;
  /** The request that is next in line, or null. */
  peek(): PartnerHomecomingRequest | null;
  /** Drops the request that is next in line (it has played). */
  shift(): void;
  subscribe(listener: () => void): () => void;
  /** Cancels timers (app unmount, tests). */
  dispose(): void;
}

export interface PartnerHomecomingDeps {
  syncNow: () => Promise<void>;
  /** Persists which walks already played. Absent = in memory only (tests). */
  shown?: ShownWalkStore;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

interface Pending {
  name: string;
  endedAt: number;
  timers: unknown[];
}

export function createPartnerHomecomingQueue(deps: PartnerHomecomingDeps): PartnerHomecomingQueue {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const pending = new Map<string, Pending>();
  const ready: PartnerHomecomingRequest[] = [];
  const played = new Set<string>();
  // Order of shown ids, oldest first, so the persisted list can drop the oldest.
  let shownOrder: string[] = [];
  const hydrated: Promise<void> = deps.shown
    ? deps.shown.load().then(
        (ids) => {
          // Merge, not replace: a walk may already have played before the stored list finished loading.
          shownOrder = [...ids, ...shownOrder.filter((id) => !ids.includes(id))].slice(-SHOWN_IDS_KEPT);
          shownOrder.forEach((id) => played.add(id));
        },
        () => undefined
      )
    : Promise.resolve();
  // One late homecoming per app open.
  let lateUsed = false;
  // Either signal may come first (her walk can reach sync a moment before the presence poll sees the end): the walk side is remembered briefly.
  const recentWalks = new Map<string, { walk: PartnerWalkAdded; at: number }>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  function enqueue(walk: PartnerWalkAdded, fallbackName: string) {
    ready.push({
      walkId: walk.walkId,
      name: walk.name ?? fallbackName,
      treatsEarned: walk.treatsEarned,
      newGroundCellCount: walk.newGroundCellCount,
      distanceMeters: walk.distanceMeters,
      walkTime: walk.startTime,
    });
    recentWalks.delete(walk.walkId);
    notify();
  }

  function forget(walkId: string) {
    const p = pending.get(walkId);
    if (!p) return;
    p.timers.forEach(clearTimer);
    pending.delete(walkId);
  }

  return {
    noteEnded({ walkId, name }) {
      if (pending.has(walkId) || played.has(walkId) || ready.some((r) => r.walkId === walkId)) return;
      const early = recentWalks.get(walkId);
      if (early && now() - early.at <= PENDING_TTL_MS) return enqueue(early.walk, name);
      const p: Pending = { name, endedAt: now(), timers: [] };
      pending.set(walkId, p);
      SYNC_RETRY_DELAYS_MS.forEach((delay) => {
        p.timers.push(
          setTimer(() => {
            if (!pending.has(walkId)) return;
            if (now() - p.endedAt > PENDING_TTL_MS) return forget(walkId);
            void deps.syncNow().catch(() => undefined);
          }, delay)
        );
      });
      p.timers.push(setTimer(() => forget(walkId), PENDING_TTL_MS + 1_000));
    },

    noteWalksAdded(walks) {
      for (const w of walks) {
        const p = pending.get(w.walkId);
        if (!p) {
          recentWalks.set(w.walkId, { walk: w, at: now() });
          continue;
        }
        forget(w.walkId);
        enqueue(w, p.name);
      }
      for (const [id, entry] of recentWalks) if (now() - entry.at > PENDING_TTL_MS) recentWalks.delete(id);
    },

    async noteLateWalks(walks) {
      await hydrated;
      if (lateUsed) return;
      let best: PartnerWalkAdded | null = null;
      for (const w of walks) {
        if (w.manual || played.has(w.walkId) || ready.some((r) => r.walkId === w.walkId)) continue;
        if (now() - w.startTime > LATE_WINDOW_MS) continue;
        if (!best || w.startTime > best.startTime) best = w;
      }
      if (!best) return;
      lateUsed = true;
      forget(best.walkId); // a pending presence end for the same walk is answered by this
      enqueue(best, best.name ?? '');
    },

    noteForeground() {
      lateUsed = false;
    },

    peek: () => ready[0] ?? null,

    shift() {
      const done = ready.shift();
      if (done) {
        played.add(done.walkId);
        shownOrder = [...shownOrder.filter((id) => id !== done.walkId), done.walkId].slice(-SHOWN_IDS_KEPT);
        void deps.shown?.save(shownOrder).catch(() => undefined);
      }
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      [...pending.keys()].forEach(forget);
    },
  };
}
