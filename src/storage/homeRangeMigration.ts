// One-time backfill: replay every previously saved tracked walk's real GPS
// trail into the Home Range grid, exactly once, on first app load after this
// feature ships. See openspec/changes/home-range/design.md's "Technical
// Split Addendum > Migration" section.
//
// Each cell is seeded with its own walk's startTime (not the replay time),
// so a year-old walk reads as a year-old (fully wild) patch, not a freshly
// painted one. Manual-log walks (locations: []) are skipped structurally —
// a manual log has no GPS evidence to discover ground with.

import { paintedCells, parseCellKey } from '../utils/grid';
import { DenEconomyRepository } from './DenEconomyRepository';
import { HomeRangeRepository, PaintCellInput } from './HomeRangeRepository';
import { WalkRepository } from './WalkRepository';

export interface HomeRangeMigrationDeps {
  walkRepository: WalkRepository;
  homeRangeRepository: HomeRangeRepository;
  denEconomyRepository: DenEconomyRepository;
}

/**
 * Idempotent: guarded by `DenEconomyState.homeRangeBackfillComplete`, the
 * same singleton-row pattern `dogName`/`xp` already use. Safe to call on
 * every app load — a no-op after the first successful run.
 */
export async function runHomeRangeMigrationIfNeeded(deps: HomeRangeMigrationDeps): Promise<void> {
  const { walkRepository, homeRangeRepository, denEconomyRepository } = deps;

  const state = await denEconomyRepository.getState();
  if (state.homeRangeBackfillComplete) return;

  const walks = await walkRepository.getWalks();
  const paintInputs: PaintCellInput[] = [];

  for (const walk of walks) {
    if (walk.locations.length === 0) continue; // manual logs never discover — walk-lifecycle/design.md

    const cells = paintedCells(walk.locations);
    for (const cellId of cells) {
      const { ix, iy } = parseCellKey(cellId);
      paintInputs.push({ ix, iy, refreshedAt: walk.startTime, tracked: true });
    }
  }

  if (paintInputs.length > 0) {
    await homeRangeRepository.paintCells(paintInputs);
  }

  await denEconomyRepository.saveState({ ...state, homeRangeBackfillComplete: true });
}
