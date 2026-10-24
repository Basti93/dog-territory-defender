import { Walk } from '../types';
import { walkDistanceMeters } from '../utils/geometry';
import { cellCentre, cellKey, MIN_CELLS_FOR_REWARD, NEW_GROUND_MIN_CELLS, newGroundCells, paintedCells, parseCellKey } from '../utils/grid';
import { confirmPromotions, findPromotionCandidates, homeCentreCell, resolveCelebrationTerritoryBeat, resolveTerritoryChanges } from '../utils/territoryCluster';
import { resolveTerritoryName } from '../utils/streetLookup';
import { bloomMultiplier } from '../economy/formulas';
import { territoryMass, territoryRate } from '../economy/territoryEconomy';
import { awardWalkRewards, WalkRewardsCelebration } from '../economy/walkRewards';
import { checkAndScheduleWalkReminder } from '../notifications/walkReminder';
import { calendarDayKey } from '../utils/manualWalkLog';
import { WalkCue } from '../feedback/walkCues';
import { log } from '../utils/log';
import { updateCorners } from './updateCorners';
import { flushLogShipper } from '../utils/logShipper';
import { AppRepositories } from './repositories';

export interface TerritoryBeat {
  /** A far patch became a territory of its own with this walk ("Neues Revier!"): the suggested name, editable in the homecoming. */
  newTerritoryName: string | null;
  /** Local id of that territory (offline players); null when the household server births it (the rename then goes by walk id). */
  newTerritoryId?: string | null;
  mergedTerritoryNames: [string, string] | null;
}

/** Treats per hour the household's ground brings, before and after this walk (only when the shown figure rose). */
export interface IncomeChange {
  from: number;
  to: number;
}

/** The income beat waits until the shown rate rose this much (treats/hour) since the last one. */
export const INCOME_BEAT_MIN_RISE = 0.2;

/** At most one income beat per local day, and only once the rate is INCOME_BEAT_MIN_RISE above the last one shown (nothing shown yet = show). */
export function shouldShowIncomeBeat(last: { day: string; rate: number } | null, today: string, rate: number): boolean {
  return !last || (last.day !== today && rate - last.rate >= INCOME_BEAT_MIN_RISE - 1e-9);
}

/** One decimal, the way the Viertel sign and the homecoming show the income. */
export function roundIncome(rate: number): number {
  return Math.round(rate * 10) / 10;
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
  /** "Unsere Ecken": this walk completed a corner (at most one); the homecoming's beat 3 asks for a name. `street` is the auto-name's source (null = neutral name). Absent = no new corner. */
  newCorner?: { id: string; street: string | null };
  /** "Euer Boden: 0,4 → 0,5/Std.": set when this walk raised the shown income. */
  incomeChange?: IncomeChange;
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
  const { homeRangeRepository, territoryRepository, walkRepository, notificationRepository, denEconomyRepository, personalStatsRepository, cornerRepository, settingsRepository } =
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
  const massBefore = await homeRangeRepository.getWorldMass();
  const rangeBeforeSet = new Set(rangeBefore.map((c) => cellKey(c.ix, c.iy)));
  const rangeBeforeLastRefreshed = new Map(rangeBefore.map((c) => [cellKey(c.ix, c.iy), c.lastRefreshed]));
  const newGround = newGroundCells(painted, rangeBeforeSet);
  const bloom = bloomMultiplier(painted, rangeBeforeLastRefreshed, Date.now());

  const now = Date.now();

  // Persisted New Ground event (docs/decisions/somewhere-wild.md
  // Decision 4) — the "Somewhere Wild" card needs to still answer "was
  // there a recent discovery" up to 48h after this walk closes. Same
  // NEW_GROUND_MIN_CELLS gate as the celebration beat; overwrites any prior event.
  if (newGround.size >= NEW_GROUND_MIN_CELLS) {
    await homeRangeRepository.recordNewGroundEvent(now, Array.from(newGround));
  }

  // Territory resolution (docs/specs/home-range.md "Reviere"): runs on every finished tracked walk that painted at
  // least one cell, using the same rangeBefore snapshot. Manual logs never reach this function.
  // A phone that joined a household does NOT birth, merge or credit territories: the server is authoritative and
  // the sync brings its ids. It only gives new cells an existing territory for immediate display (the sync's
  // cells.changed corrects them) and predicts a promotion so the homecoming can show its moment.
  const joined = Boolean(deps.sync) && Boolean(await settingsRepository?.getSyncIdentity?.());
  const territoryIdByNewCellId = new Map<string, string>();
  let creditedTerritoryId: string | null = null;
  let creditedTerritoryName: string | null = null;
  let resolvedTerritoryBeat: TerritoryBeat | null = null;
  let pendingMerges: Array<{ survivorId: string; loserId: string }> = [];
  let mergeBeatPlan: { merges: Array<{ survivorId: string; loserId: string }> } = { merges: [] };
  let existingTerritories = await territoryRepository.getTerritories();
  let nameHint: string | null = null;
  let storedWalks: Awaited<ReturnType<typeof walkRepository.getWalks>> = [];
  let homeCentre: ReturnType<typeof homeCentreCell> = null;

  if (painted.size > 0) {
    const territoryCreatedAt = new Map(existingTerritories.map((t) => [t.id, t.createdAt]));
    // Home = where the first tracked walks started (this walk counts when it is the first): stable, the same on every device.
    storedWalks = await walkRepository.getWalks();
    homeCentre = homeCentreCell([...storedWalks.filter((w) => w.id !== walk.id), walk]);
    const plan = resolveTerritoryChanges(rangeBefore, painted, now, territoryCreatedAt, homeCentre);
    const territoryNamesById = new Map(existingTerritories.map((t) => [t.id, t.name] as const));

    if (joined) {
      for (const [cellId, id] of plan.newCellAssignments) if (territoryCreatedAt.has(id)) territoryIdByNewCellId.set(cellId, id);
      creditedTerritoryName = territoryNamesById.get(plan.creditedTerritoryId) ?? null;
      const birth = plan.births[0];
      if (birth) {
        // The server births the household's first territory; it names it with this hint.
        const [lat, lon] = cellCentre(birth.anchorCell.ix, birth.anchorCell.iy);
        nameHint = await resolveTerritoryName(lat, lon, deps.dogName);
      }
    } else {
      const provisionalToRealId = new Map<string, string>();
      for (const birth of plan.births) {
        const [lat, lon] = cellCentre(birth.anchorCell.ix, birth.anchorCell.iy);
        const name = await resolveTerritoryName(lat, lon, deps.dogName);
        const realId = await territoryRepository.createTerritory(name, now);
        provisionalToRealId.set(birth.provisionalId, realId);
        territoryNamesById.set(realId, name);
      }
      const resolveRealId = (id: string) => provisionalToRealId.get(id) ?? id;
      for (const [cellId, id] of plan.newCellAssignments) territoryIdByNewCellId.set(cellId, resolveRealId(id));
      creditedTerritoryId = resolveRealId(plan.creditedTerritoryId) || null;
      creditedTerritoryName = creditedTerritoryId ? territoryNamesById.get(creditedTerritoryId) ?? null : null;
      pendingMerges = plan.merges;
      mergeBeatPlan = plan;
      resolvedTerritoryBeat = resolveCelebrationTerritoryBeat(plan, null, territoryNamesById);
    }
  }

  if (painted.size > 0) {
    await homeRangeRepository.paintCells(
      Array.from(painted).map((id) => {
        const { ix, iy } = parseCellKey(id);
        return { ix, iy, refreshedAt: now, tracked: true, territoryId: territoryIdByNewCellId.get(id) };
      })
    );
  }

  // Merge check runs AFTER this walk's own new cells are persisted above: reassignCellsToTerritory (a bulk "every
  // cell currently in fromId" UPDATE) only sweeps a new cell assimilated into a merge loser if it already exists.
  for (const merge of pendingMerges) {
    await homeRangeRepository.reassignCellsToTerritory(merge.loserId, merge.survivorId);
    await territoryRepository.mergeTerritoryStats(merge.survivorId, merge.loserId);
  }

  // Promotion: a far patch walked on 2+ walks with 40+ cells becomes a territory of its own. Cheap check first; the
  // walk history is only read when a patch touched by this walk is big enough.
  if (painted.size > 0) {
    try {
      if (pendingMerges.length > 0) existingTerritories = await territoryRepository.getTerritories();
      const createdAt = new Map(existingTerritories.map((t) => [t.id, t.createdAt]));
      const candidates = findPromotionCandidates(await homeRangeRepository.getCells(), createdAt, painted, homeCentre);
      if (candidates.length > 0) {
        const earlier = storedWalks
          .filter((w) => w.id !== walk.id && w.startSource !== 'manual-log')
          .map((w) => paintedCells(w.locations));
        const [promotion] = confirmPromotions(candidates, painted, earlier);
        if (promotion) {
          const [lat, lon] = cellCentre(promotion.anchorCell.ix, promotion.anchorCell.iy);
          const name = await resolveTerritoryName(lat, lon, deps.dogName);
          let newTerritoryId: string | null = null;
          if (joined) {
            nameHint = name;
          } else {
            newTerritoryId = await territoryRepository.createTerritory(name, now);
            await homeRangeRepository.assignTerritoryToCells(promotion.cellIds, newTerritoryId);
            await territoryRepository.incrementTerritoryStats(newTerritoryId, { walksIncrement: promotion.walks, treatsIncrement: 0 });
          }
          const names = new Map(existingTerritories.map((t) => [t.id, t.name] as const));
          resolvedTerritoryBeat = { ...resolveCelebrationTerritoryBeat(mergeBeatPlan, name, names), newTerritoryId };
        }
      }
    } catch (err) {
      log('TERRITORY_PROMOTION_ERROR', { id: walk.id, error: String(err) });
    }
  }

  // newGroundCellIds (docs/decisions/walk-portrait.md Decision 4):
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
    await deps.sync?.enqueueWalk(finishedWalk, nameHint).catch((err) =>
      log('SYNC_ENQUEUE_ERROR', { id: finishedWalk.id, error: String(err) })
    );
    // docs/decisions/walk-reminder.md Decision 4: recheck right after
    // a tracked walk finishes, not just at the next app open.
    await checkAndScheduleWalkReminder({ walkRepository, notificationRepository }).catch((err) =>
      log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
    );
  } catch (err) {
    console.error('Failed to save walk:', err);
    log('STORAGE_WALK_SAVE_ERROR', { id: finishedWalk.id, error: String(err) });
  }
  // Walk saved: send the walk's log lines to the server (rate limited, no-op when not joined).
  void flushLogShipper();

  // "Unsere Ecken": did this walk complete a corner? Runs for every saved walk, rewarded or not, and never breaks the finish.
  let newCorner: WalkRewardsOutcome['newCorner'];
  if (cornerRepository) {
    try {
      const created = await updateCorners({ walkRepository, cornerRepository });
      const mine = created.find((c) => c.walkId === finishedWalk.id);
      if (mine) newCorner = { id: mine.id, street: (await cornerRepository.getCorners()).find((c) => c.id === mine.id)?.street ?? null };
    } catch (err) {
      log('CORNERS_UPDATE_ERROR', { id: finishedWalk.id, error: String(err) });
    }
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

  const distanceMeters = walkDistanceMeters(finishedWalk);
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
    // "Euer Boden: 0,4 → 0,5/Std.": the same formula, same level, mass before and after this walk's paint.
    let incomeChange: IncomeChange | undefined;
    try {
      const level = result.denEconomyState.level;
      const massAfter = await homeRangeRepository.getWorldMass();
      const from = roundIncome(territoryRate(territoryMass(massBefore.cellCount, massBefore.visitsSum), level));
      const to = roundIncome(territoryRate(territoryMass(massAfter.cellCount, massAfter.visitsSum), level));
      if (to > from) {
        // At most one income beat per local day, and only once the figure is 0.2/h above the last one shown.
        const today = calendarDayKey(now);
        const last = (await settingsRepository?.getIncomeBeatShown?.()) ?? null;
        if (shouldShowIncomeBeat(last, today, to)) {
          incomeChange = { from, to };
          await settingsRepository?.saveIncomeBeatShown?.({ day: today, rate: to });
        }
      }
    } catch {
      // cosmetic only
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
      ...(newCorner ? { newCorner } : {}),
      ...(incomeChange ? { incomeChange } : {}),
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
