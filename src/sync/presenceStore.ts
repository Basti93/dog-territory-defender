// What the viewer knows about other household members' walks in progress (M4 "Alex im Hof"). In memory only: a
// walk in progress is a moment, not data. The presence poller (presenceViewer.ts) is the only writer; the world
// scene and the maps read through usePartnerPresence.
//
// The "stale" rule lives here: an entry whose last heartbeat is older than PRESENCE_STALE_MS simply stops being
// shown (no "offline", no "last seen"). Age is measured without trusting the two clocks to agree: how old the
// heartbeat already was on the server when we received it, plus how long ago we received it.

import { useEffect, useState, useSyncExternalStore } from 'react';

import type { PresenceEntry, PresencePoint } from './apiContract';

/** A partner walk with no heartbeat for this long is treated as gone. */
export const PRESENCE_STALE_MS = 3 * 60 * 1000;
/** How often a mounted viewer re-checks the stale rule between polls. */
const RECHECK_MS = 15_000;

export interface PartnerPresence {
  playerId: string;
  name: string;
  walkId: string;
  startedAt: number;
  points: PresencePoint[];
  /** Server time of the last heartbeat. */
  updatedAt: number;
  /** Local clock when this snapshot arrived. */
  receivedAt: number;
  /** serverTime - updatedAt of that snapshot: how stale the heartbeat already was on arrival. */
  ageAtReceiptMs: number;
}

let entries: PartnerPresence[] = [];
const listeners = new Set<() => void>();

export const getPartnerPresence = (): PartnerPresence[] => entries;

export function subscribePartnerPresence(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replaces everything with the latest server answer. */
export function setPartnerPresence(presence: PresenceEntry[], serverTime: number, localNow: number): void {
  const next = presence.map((e) => {
    // Same heartbeat as before: keep the very same object, so screens that draw from it (the maps) do not redraw
    // every poll, and the age keeps counting from when we first got it.
    const known = entries.find((k) => k.walkId === e.walkId && k.updatedAt === e.updatedAt);
    return known ?? { ...e, receivedAt: localNow, ageAtReceiptMs: Math.max(0, serverTime - e.updatedAt) };
  });
  if (next.length === entries.length && next.every((e, i) => e === entries[i])) return;
  entries = next;
  listeners.forEach((l) => l());
}

export function clearPartnerPresence(): void {
  if (entries.length === 0) return;
  entries = [];
  listeners.forEach((l) => l());
}

/** Pure stale rule. */
export function isPresenceFresh(entry: PartnerPresence, localNow: number): boolean {
  return entry.ageAtReceiptMs + Math.max(0, localNow - entry.receivedAt) <= PRESENCE_STALE_MS;
}

/** The partner walk to show: the freshest one that is not stale, or null. */
export function pickPartnerWalk(all: PartnerPresence[], localNow: number): PartnerPresence | null {
  let best: PartnerPresence | null = null;
  for (const e of all) {
    if (!isPresenceFresh(e, localNow)) continue;
    if (!best || e.updatedAt > best.updatedAt) best = e;
  }
  return best;
}

/**
 * The partner walk to show right now (stale ones are dropped silently). Re-checks the stale rule every 15 s, but only
 * while there is an entry at all, so an idle screen holds no timer.
 */
export function usePartnerWalk(now: () => number = Date.now): PartnerPresence | null {
  const all = useSyncExternalStore(subscribePartnerPresence, getPartnerPresence);
  const [, setTick] = useState(0);
  const hasAny = all.length > 0;
  useEffect(() => {
    if (!hasAny) return;
    const id = setInterval(() => setTick((n) => n + 1), RECHECK_MS);
    return () => clearInterval(id);
  }, [hasAny]);
  return pickPartnerWalk(all, now());
}
