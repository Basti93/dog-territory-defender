import type { WalkRepository } from '../storage/WalkRepository';
import { log } from '../utils/log';
import { analyseWalk, statsFields, WALK_STATS_VERSION } from './walkRepair';

export interface LocalRepairReport {
  checked: number;
  /** Walks stamped with the current statistics view this run. */
  repaired: number;
  /** Of those: walks whose idle tail was cut. */
  trimmed: number;
  /** Of those: walks now kept out of averages and records. */
  excluded: number;
}

/**
 * App start: gives every stored walk the statistics view (walkRepair.ts analyseWalk) it does not carry yet or carries for an
 * older rule set. Covers walks the server never saw (offline, not uploaded) and walks from before the repair; walks that came
 * from the server already carry the server's view and are skipped. Idempotent: a second run finds nothing to do. Touches only the
 * four stats* fields, never the fixes, the reward or `syncedAt`.
 */
export async function repairLocalWalks(walks: WalkRepository): Promise<LocalRepairReport> {
  const report: LocalRepairReport = { checked: 0, repaired: 0, trimmed: 0, excluded: 0 };
  for (const stored of await walks.getWalks()) {
    report.checked += 1;
    if (stored.statsVersion === WALK_STATS_VERSION) continue;
    const stats = analyseWalk(stored);
    const { syncedAt: _syncedAt, statsEndTime: _end, statsDistanceM: _distance, statsExcluded: _excluded, ...walk } = stored;
    await walks.saveWalk({ ...walk, ...statsFields(stats) });
    report.repaired += 1;
    if (stats.trimmedFixCount > 0) report.trimmed += 1;
    if (stats.excluded) report.excluded += 1;
  }
  if (report.repaired > 0) log('WALK_STATS_REPAIRED', { ...report });
  return report;
}
