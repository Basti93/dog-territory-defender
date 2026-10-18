// In-process scheduler (design Decision 19): a plain setInterval tick, no OS cron, no node-cron dependency. The daily
// 06:15 planning is a time check inside the tick (per host timezone, idempotent). Single api instance; the
// per-host Postgres advisory lock in tick.ts is the guard if that ever changes.
import { NEIGHBOUR_CONFIG } from '@game/economy/neighbourConfig';
import type { Config } from '../config';
import type { Db } from '../db/client';
import type { EventBus } from '../services/events';
import { runTick } from './tick';

export function startNeighbourScheduler(db: Db, bus: EventBus, config: Config, log: (msg: string, extra?: unknown) => void): () => void {
  if (!config.neighbours.enabled) return () => {};
  let running = false; // one job at a time (RAM budget)
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runTick({ db, bus, config, now: Date.now() });
      if (r.walksWritten || r.eventsEmitted || r.tilesFetched) log('neighbour tick', r);
    } catch (err) {
      log('neighbour tick failed', err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void run(), 10_000); // catch-up shortly after start
  const timer = setInterval(() => void run(), NEIGHBOUR_CONFIG.scheduler.tickMs);
  // do not keep the process alive for the scheduler alone
  for (const handle of [first, timer]) (handle as unknown as { unref?: () => void }).unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
