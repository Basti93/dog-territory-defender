import { Walk } from '../types';
import { cumulativeDistance } from '../utils/geometry';
import { cellCentre, cellKey, MIN_CELLS_FOR_REWARD, NEW_GROUND_MIN_CELLS, newGroundCells, paintedCells, parseCellKey } from '../utils/grid';
import { resolveCelebrationTerritoryBeat, resolveTerritoryChanges } from '../utils/territoryCluster';
import { resolveTerritoryName } from '../utils/streetLookup';
import { bloomMultiplier } from '../economy/formulas';
import { awardWalkRewards, WalkRewardsCelebration } from '../economy/walkRewards';
import { checkAndScheduleWalkReminder } from '../notifications/walkReminder';
import { WalkCue } from '../feedback/walkCues';
import { log } from '../utils/log';
import { AppRepositories } from './repositories';

export interface TerritoryBeat {
  newTerritoryName: string | null;
  mergedTerritoryNames: [string, string] | null;
}

/** What a finished, rewarded walk hands back to the UI layer. */
export interface WalkRewardsOutcome {
  walkId: string;
  treats: number;
  level: number;
  celebration: WalkRewardsCelebration;
  territoryBeat: TerritoryBeat | null;
  /** Inputs for the Den's Wild Extras (cosmetic cameos); absent for manual logs. */
  /** Walk length in metres (the homecoming's fallback "one number"). */
  distanceMeters?: number;
  /** Name of the territory this walk was credited to, for the homecoming's closing line. */
  territoryName?: string | null;
  wildExtra?: { distanceKm: number; walkIndex: number; closedAt: number };
}

export interface FinishTrackedWalkDeps {
  repos: AppRepositories;
  dogName: string | null;
  /** Called with the cue to play (walk-done), if any. */
  onFinishCue: (qualifies: boolean) => WalkCue | null;
  playCue: (cue: WalkCue) => void;
  /** Walk is final (closed flag, newGroundCellIds); tracking is over. */
  onWalkFinished: (finishedWalk: Walk) => void;
  /** Home Range cells were persisted; the idle map should re-render them. */
  onRangeChanged: () => void;
  onRewards: (outcome: WalkRewardsOutcome) => void;
  /** Household sync: queues the finished walk for upload. Optional; absent = local only. */
  sync?: { enqueueWalk: (walk: Walk, territoryNameHint: string | null) => Promise<void> };
}

/**
 * Finish Walk — replaces the old Close Territory/End Walk pair (design.md's
 * Technical Split Addendum: painting is decoupled from loop closure). Every
 * finished tracked walk is saved and paints the Home Range regardless of its
 * shape; reward eligibility gates on the 25-painted-cell floor
 * (MIN_CELLS_FOR_REWARD).
 */
export async function finishTrackedWalk(walk: Walk, deps: FinishTrackedWalkDeps): Promise<void> {
  const { homeRangeRepository, territoryRepository, walkRepository, notificationRepository, denEconomyRepository, personalStatsRepository } =
    deps.repos;
  const painted = paintedCells(walk.locations);
  const qualifies = painted.size >= MIN_CELLS_FOR_REWARD;
  const doneCue = deps.onFinishCue(qualifies);
  if (doneCue) deps.playCue(doneCue);

  // Snapshot the Range before painting this walk's cells, so New Ground
  // detection AND the Fresh Ground bloomMultiplier both compare against
  // what existed *before* this walk (design.md Decisions 3 and 5) —
  // painting below would otherwise make every cell "already refreshed."
  const rangeBefore = await homeRangeRepository.getCells();
  const rangeBeforeSet = new Set(rangeBefore.map((c) => cellKey(c.ix, c.iy)));
  const rangeBeforeLastRefreshed = new Map(rangeBefore.map((c) => [cellKey(c.ix, c.iy), c.lastRefreshed]));
  const newGround = newGroundCells(painted, rangeBeforeSet);
  const bloom = bloomMultiplier(painted, rangeBeforeLastRefreshed, Date.now());

  const now = Date.now();

  // Persisted New Ground event (docs/decisions/somewhere-wild/design.md
  // Decision 4) — the "Somewhere Wild" card needs to still answer "was
  // there a recent discovery" up to 48h after this walk closes. Same
  // NEW_GROUND_MIN_CELLS gate as the celebration beat; overwrites any prior event.
  if (newGround.size >= NEW_GROUND_MIN_CELLS) {
    await homeRangeRepository.recordNewGroundEvent(now, Array.from(newGround));
  }

  // Territory resolution (docs/decisions/territories/design.md Decision 3) —
  // runs on every finished tracked walk that painted at least one cell, using
  // the same rangeBefore snapshot. Manual logs never reach this function
  // (design.md Decision 5's structural exclusion).
  const territoryIdByNewCellId = new Map<string, string>();
  let creditedTerritoryId: string | null = null;
  let creditedTerritoryName: string | null = null;
  let resolvedTerritoryBeat: TerritoryBeat | null = null;
  let pendingMerges: Array<{ survivorId: string; loserId: string }> = [];

  if (painted.size > 0) {
    const existingTerritories = await territoryRepository.getTerritories();
    const territoryCreatedAt = new Map(existingTerritories.map((t) => [t.id, t.createdAt]));
    const plan = resolveTerritoryChanges(rangeBefore, painted, now, territoryCreatedAt);

    // Resolve each birth's name (reverse-geocode) and create its real
    // Territory row, mapping the plan's provisional ids to real ones.
    const birthNamesByProvisionalId = new Map<string, string>();
    const provisionalToRealId = new Map<string, string>();
    for (const birth of plan.births) {
      const [lat, lon] = cellCentre(birth.anchorCell.ix, birth.anchorCell.iy);
      const name = await resolveTerritoryName(lat, lon, deps.dogName);
      const realId = await territoryRepository.createTerritory(name, now);
      birthNamesByProvisionalId.set(birth.provisionalId, name);
      provisionalToRealId.set(birth.provisionalId, realId);
    }
    const resolveRealId = (id: string) => provisionalToRealId.get(id) ?? id;

    for (const [cellId, id] of plan.newCellAssignments) {
      territoryIdByNewCellId.set(cellId, resolveRealId(id));
    }

    const territoryNamesById = new Map(existingTerritories.map((t) => [t.id, t.name] as const));
    for (const [provisionalId, name] of birthNamesByProvisionalId) {
      territoryNamesById.set(resolveRealId(provisionalId), name);
    }

    creditedTerritoryId = resolveRealId(plan.creditedTerritoryId);
    creditedTerritoryName = territoryNamesById.get(creditedTerritoryId) ?? null;
    resolvedTerritoryBeat = resolveCelebrationTerritoryBeat(plan, birthNamesByProvisionalId, territoryNamesById);
    pendingMerges = plan.merges;
  }

  if (painted.size > 0) {
    await homeRangeRepository.paintCells(
      Array.from(painted).map((id) => {
        const { ix, iy } = parseCellKey(id);
        return { ix, iy, refreshedAt: now, tracked: true, territoryId: territoryIdByNewCellId.get(id) };
      })
    );
  }

  // Merge check runs AFTER this walk's own new cells are persisted above
  // (design.md Decision 3's own Step 3-then-Step-4 ordering) — reassignCellsToTerritory
  // (a bulk "every cell currently in fromId" UPDATE) only sweeps a new cell
  // assimilated into a merge loser if that cell already exists in the table.
  for (const merge of pendingMerges) {
    await homeRangeRepository.reassignCellsToTerritory(merge.loserId, merge.survivorId);
    await territoryRepository.mergeTerritoryStats(merge.survivorId, merge.loserId);
  }

  // newGroundCellIds (docs/decisions/walk-portrait/design.md Decision 4):
  // the same newGround Set computed above, written so the Walk Portrait can
  // later highlight this walk's own New Ground segments.
  const finishedWalk: Walk = { ...walk, closed: qualifies, newGroundCellIds: Array.from(newGround) };

  log('WALK_FINISHED', {
    id: finishedWalk.id,
    points: finishedWalk.locations.length,
    cellsPainted: painted.size,
    newGroundCells: newGround.size,
    qualifies,
  });

  deps.onWalkFinished(finishedWalk);

  try {
    await walkRepository.saveWalk(finishedWalk);
    log('STORAGE_WALK_SAVED', { id: finishedWalk.id, closed: qualifies });
    // Never lets a sync problem touch the walk's local result.
    await deps.sync?.enqueueWalk(finishedWalk, resolvedTerritoryBeat?.newTerritoryName ?? null).catch((err) =>
      log('SYNC_ENQUEUE_ERROR', { id: finishedWalk.id, error: String(err) })
    );
    // docs/decisions/walk-reminder/design.md Decision 4: recheck right after
    // a tracked walk finishes, not just at the next app open.
    await checkAndScheduleWalkReminder({ walkRepository, notificationRepository }).catch((err) =>
      log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
    );
  } catch (err) {
    console.error('Failed to save walk:', err);
    log('STORAGE_WALK_SAVE_ERROR', { id: finishedWalk.id, error: String(err) });
  }

  // Refresh the idle map's Home Range render now that new cells (if any) are persisted.
  deps.onRangeChanged();

  if (!qualifies) {
    // Territory attribution (walksIncrement) still happens for a walk that
    // painted ground but didn't clear the rewards floor. No treats earned.
    if (creditedTerritoryId) {
      await territoryRepository.incrementTerritoryStats(creditedTerritoryId, { walksIncrement: 1, treatsIncrement: 0 });
    }
    // The walk is saved and its cells are painted, but there's no reward and
    // no celebration screen (so no territory beat either).
    return;
  }

  const distanceMeters = cumulativeDistance(finishedWalk.locations);
  try {
    const result = await awardWalkRewards(
      finishedWalk,
      distanceMeters,
      painted.size,
      { denEconomyRepository, personalStatsRepository, walkRepository },
      newGround.size,
      bloom
    );
    if (creditedTerritoryId) {
      await territoryRepository.incrementTerritoryStats(creditedTerritoryId, {
        walksIncrement: 1,
        treatsIncrement: result.celebration.treatsEarned,
      });
    }
    let walkIndex = 0;
    try {
      walkIndex = (await walkRepository.getWalks()).length;
    } catch {
      // cosmetic input only; no mailbox extra this time
    }
    deps.onRewards({
      walkId: walk.id,
      treats: result.denEconomyState.treats,
      level: result.denEconomyState.level,
      celebration: result.celebration,
      territoryBeat: resolvedTerritoryBeat,
      distanceMeters,
      territoryName: creditedTerritoryName,
      wildExtra: { distanceKm: distanceMeters / 1000, walkIndex, closedAt: Date.now() },
    });

    // Second patch write (walk-portrait/design.md Decision 5): records
    // treatsEarned on this walk's own stored record. Never user-visible.
    try {
      await walkRepository.saveWalk({ ...finishedWalk, treatsEarned: result.celebration.treatsEarned });
    } catch (err) {
      log('STORAGE_WALK_TREATS_PATCH_ERROR', { id: finishedWalk.id, error: String(err) });
    }
  } catch (err) {
    console.error('Failed to award walk treats:', err);
  }
}
