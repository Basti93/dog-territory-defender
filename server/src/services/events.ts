import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { EventEmitter } from 'node:events';
import type { ApiEvent, EventKind, EventPayloads, EventsResponse } from '@game/sync/apiContract';
import { API_LIMITS } from '@game/sync/apiContract';
import type { Db } from '../db/client';
import { events } from '../db/schema';

/** A registered long-poll listener. Notifications that arrive before `wait()` is called are remembered. */
export interface BusSubscription {
  /** Resolves when notified (now or since subscribe/last wait), on timeout, abort, or bus shutdown. */
  wait(timeoutMs: number): Promise<void>;
  dispose(): void;
}

/** In-process wake-up for long-poll waiters. Single API instance in v1 (design Decision 5/13). */
export class EventBus {
  private emitter = new EventEmitter();
  private waiters = new Map<string, number>();
  private closed = false;

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  get isShutdown(): boolean {
    return this.closed;
  }

  notify(householdId: string): void {
    this.emitter.emit(householdId);
  }

  /** SIGTERM path: wakes every waiter so in-flight long-polls return and the server can close promptly. */
  shutdown(): void {
    this.closed = true;
    for (const householdId of this.waiters.keys()) this.emitter.emit(householdId);
  }

  waiterCount(householdId: string): number {
    return this.waiters.get(householdId) ?? 0;
  }

  /**
   * Registers a listener immediately (call BEFORE reading the feed, so a notify between the read and
   * the wait is not lost). Counts as a waiter until disposed.
   */
  subscribe(householdId: string, signal?: AbortSignal): BusSubscription {
    this.waiters.set(householdId, this.waiterCount(householdId) + 1);
    let pending = this.closed;
    let wake: (() => void) | null = null;
    const onEvent = () => {
      pending = true;
      wake?.();
    };
    this.emitter.on(householdId, onEvent);
    signal?.addEventListener('abort', onEvent, { once: true });
    return {
      wait: (timeoutMs) =>
        new Promise<void>((resolve) => {
          if (pending || signal?.aborted) {
            pending = false;
            return resolve();
          }
          const timer = setTimeout(() => finish(), timeoutMs);
          const finish = () => {
            clearTimeout(timer);
            wake = null;
            pending = false;
            resolve();
          };
          wake = finish;
        }),
      dispose: () => {
        this.emitter.off(householdId, onEvent);
        signal?.removeEventListener('abort', onEvent);
        const left = Math.max(0, this.waiterCount(householdId) - 1);
        if (left === 0) this.waiters.delete(householdId);
        else this.waiters.set(householdId, left);
      },
    };
  }
}

export async function appendEvent<K extends EventKind>(
  tx: Db,
  householdId: string,
  kind: K,
  actorPlayerId: string | null,
  payload: EventPayloads[K]
): Promise<number> {
  const [row] = await tx
    .insert(events)
    .values({ householdId, kind, actorPlayerId, payload })
    .returning({ seq: events.seq });
  return row.seq;
}

export async function currentSeq(db: Db, householdId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${events.seq}), 0)::int` })
    .from(events)
    .where(eq(events.householdId, householdId));
  return row?.max ?? 0;
}

export async function pullEvents(db: Db, householdId: string, after: number, limit: number): Promise<EventsResponse> {
  const take = Math.min(Math.max(1, limit), API_LIMITS.maxEventsPerPull);
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.householdId, householdId), gt(events.seq, after)))
    .orderBy(asc(events.seq))
    .limit(take + 1);
  const page = rows.slice(0, take);
  const mapped = page.map((r) => ({
    seq: r.seq,
    kind: r.kind,
    actorPlayerId: r.actorPlayerId,
    createdAt: r.createdAt.getTime(),
    payload: r.payload,
  })) as ApiEvent[];
  return {
    events: mapped,
    cursor: mapped.length > 0 ? mapped[mapped.length - 1].seq : after,
    hasMore: rows.length > take,
    serverTime: Date.now(),
  };
}

/** When the per-household waiter cap is hit we pause this long instead of answering at once, so a
 * client that immediately re-polls cannot spin the server. */
export const CAPPED_POLL_PAUSE_MS = 2000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });

/** Long-poll: returns immediately when events exist, else waits up to waitSeconds for one. */
export async function pullEventsLongPoll(
  db: Db,
  bus: EventBus,
  householdId: string,
  after: number,
  limit: number,
  waitSeconds: number,
  maxWaiters: number,
  signal?: AbortSignal,
  cappedPauseMs = CAPPED_POLL_PAUSE_MS
): Promise<EventsResponse> {
  if (waitSeconds <= 0) return pullEvents(db, householdId, after, limit);
  if (bus.waiterCount(householdId) >= maxWaiters) {
    await sleep(cappedPauseMs, signal);
    return pullEvents(db, householdId, after, limit);
  }
  // Subscribe first, then read: an event committed between the read and the wait still wakes us.
  const sub = bus.subscribe(householdId, signal);
  try {
    const deadline = Date.now() + Math.min(waitSeconds, API_LIMITS.maxEventWaitSeconds) * 1000;
    let result = await pullEvents(db, householdId, after, limit);
    while (result.events.length === 0 && Date.now() < deadline && !signal?.aborted && !bus.isShutdown) {
      await sub.wait(deadline - Date.now());
      result = await pullEvents(db, householdId, after, limit);
    }
    return result;
  } finally {
    sub.dispose();
  }
}
