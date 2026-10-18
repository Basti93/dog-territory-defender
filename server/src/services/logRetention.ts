// Hourly retention: device logs older than 14 days and live-presence rows older than 6 h. Independent of the
// neighbour scheduler (which idles when NEIGHBOURS_ENABLED is off), so it is its own tiny timer.
import type { Db } from '../db/client';
import { purgeOldDeviceLogs } from './deviceLogs';
import { purgeStalePresence } from './presence';

export function startLogRetention(db: Db, log: (msg: string, extra?: unknown) => void): () => void {
  const run = async () => {
    try {
      const n = await purgeOldDeviceLogs(db, Date.now());
      if (n > 0) log('device logs purged', { rows: n });
      const p = await purgeStalePresence(db, Date.now());
      if (p > 0) log('stale presence purged', { rows: p });
    } catch (err) {
      log('retention purge failed', err instanceof Error ? err.message : err);
    }
  };
  const first = setTimeout(() => void run(), 30_000);
  const timer = setInterval(() => void run(), 3600_000);
  for (const handle of [first, timer]) (handle as unknown as { unref?: () => void }).unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
