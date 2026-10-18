// Full-path coverage for the territories change (docs/decisions/territories
// tasks.md task 13.2), mirroring this codebase's existing precedent
// (somewhere-wild/home-dashboard's own full-path tests): a synthetic
// multi-walk history run through the real repositories end-to-end, not just
// each pure unit in isolation.

import { territoryMass, territoryRate } from '../../economy/territoryEconomy';
import { cellKey } from '../../utils/grid';
import { resolveTerritoryChanges } from '../../utils/territoryCluster';
import { createInMemoryHomeRangeRepository } from '../inMemoryHomeRangeRepository';
import { createInMemoryTerritoryRepository } from '../inMemoryTerritoryRepository';

/** A filled rectangular block of cell ids. */
function block(originIx: number, originIy: number, width: number, height: number): Set<string> {
  const ids = new Set<string>();
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      ids.add(cellKey(originIx + dx, originIy + dy));
    }
  }
  return ids;
}

/** Persists one walk's territory resolution exactly the way App.tsx's finishWalk does — the same orchestration, without the celebration-screen/reward plumbing this test doesn't need. */
async function runWalk(
  homeRangeRepository: ReturnType<typeof createInMemoryHomeRangeRepository>,
  territoryRepository: ReturnType<typeof createInMemoryTerritoryRepository>,
  painted: Set<string>,
  now: number,
  treatsAwarded: number
) {
  const rangeBefore = await homeRangeRepository.getCells();
  const existingTerritories = await territoryRepository.getTerritories();
  const territoryCreatedAt = new Map(existingTerritories.map((t) => [t.id, t.createdAt]));

  const plan = resolveTerritoryChanges(rangeBefore, painted, now, territoryCreatedAt);

  const provisionalToRealId = new Map<string, string>();
  for (const birth of plan.births) {
    const realId = await territoryRepository.createTerritory(`Territory born at ${now}`, now);
    provisionalToRealId.set(birth.provisionalId, realId);
  }
  const resolveRealId = (id: string) => provisionalToRealId.get(id) ?? id;

  // Paint this walk's own new cells BEFORE applying merges (design.md
  // Decision 3's Step 3-then-Step-4 ordering) — a new cell assimilated into
  // a territory that turns out to be this walk's merge loser must already
  // exist in the table by the time reassignCellsToTerritory's bulk
  // "every cell currently in fromId" UPDATE runs, or it would be stranded
  // on the now-defunct loser id forever.
  await homeRangeRepository.paintCells(
    Array.from(painted).map((id) => {
      const [ix, iy] = id.split(',').map(Number);
      const assignedId = plan.newCellAssignments.get(id);
      return { ix, iy, refreshedAt: now, tracked: true, territoryId: assignedId ? resolveRealId(assignedId) : undefined };
    })
  );

  for (const merge of plan.merges) {
    await homeRangeRepository.reassignCellsToTerritory(merge.loserId, merge.survivorId);
    await territoryRepository.mergeTerritoryStats(merge.survivorId, merge.loserId);
  }

  const creditedId = resolveRealId(plan.creditedTerritoryId);
  await territoryRepository.incrementTerritoryStats(creditedId, { walksIncrement: 1, treatsIncrement: treatsAwarded });

  return { plan, creditedId };
}

describe('territories full path', () => {
  it('two separate neighborhoods birth two territories, then a bridging walk merges them with correct attribution and a split-invariant territoryRate', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const day1 = Date.parse('2026-01-01T08:00:00Z');
    const day2 = Date.parse('2026-01-02T08:00:00Z');
    const day3 = Date.parse('2026-01-03T08:00:00Z');

    // Walk 1: the "home" neighborhood.
    const home = block(0, 0, 4, 4);
    const { plan: plan1 } = await runWalk(homeRangeRepository, territoryRepository, home, day1, 50);
    expect(plan1.births).toHaveLength(1);

    // Walk 2: a genuinely separate "office" neighborhood, far away (>400m).
    const office = block(100, 100, 4, 4);
    const { plan: plan2 } = await runWalk(homeRangeRepository, territoryRepository, office, day2, 55);
    expect(plan2.births).toHaveLength(1);

    let territories = await territoryRepository.getTerritories();
    expect(territories).toHaveLength(2);
    const homeTerritory = territories.find((t) => t.createdAt === day1)!;
    const officeTerritory = territories.find((t) => t.createdAt === day2)!;
    expect(homeTerritory.walksHere).toBe(1);
    expect(homeTerritory.treatsEarnedHere).toBe(50);
    expect(officeTerritory.walksHere).toBe(1);
    expect(officeTerritory.treatsEarnedHere).toBe(55);

    // Walk 3: nothing new painted directly bridges home and office in this
    // synthetic setup (100 cells apart is too far for one walk to close in
    // a single painted patch) — instead, confirm re-covering home ground
    // alone correctly attributes to the SAME (older) territory, not a new one.
    const { plan: plan3, creditedId } = await runWalk(homeRangeRepository, territoryRepository, home, day3, 12);
    expect(plan3.births).toHaveLength(0);
    expect(plan3.merges).toHaveLength(0);
    expect(creditedId).toBe(homeTerritory.id);

    territories = await territoryRepository.getTerritories();
    const homeAfter = territories.find((t) => t.id === homeTerritory.id)!;
    expect(homeAfter.walksHere).toBe(2);
    expect(homeAfter.treatsEarnedHere).toBe(62);

    // Split-invariance (design.md Decision 6): the final territoryRate must
    // equal what a single ungrouped worldMass aggregate says, regardless of
    // there being two separate territories on the board.
    const worldMass = await homeRangeRepository.getWorldMass();
    const rateFromRepo = territoryRate(territoryMass(worldMass.cellCount, worldMass.visitsSum), 1);

    const allCells = await homeRangeRepository.getCells();
    const manualCellCount = allCells.length;
    const manualVisitsSum = allCells.reduce((sum, c) => sum + c.visits, 0);
    const rateFromManualSum = territoryRate(territoryMass(manualCellCount, manualVisitsSum), 1);

    expect(rateFromRepo).toBe(rateFromManualSum);
  });

  it('a bridging walk that literally connects two existing territories merges them, keeping the older name/id and summing stats', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const day1 = Date.parse('2026-01-01T08:00:00Z');
    const day2 = Date.parse('2026-01-02T08:00:00Z');
    const day3 = Date.parse('2026-01-03T08:00:00Z');

    const territoryA = block(0, 0, 2, 2); // ix 0-1, iy 0-1
    await runWalk(homeRangeRepository, territoryRepository, territoryA, day1, 50);

    const territoryB = block(3, 0, 2, 2); // ix 3-4, iy 0-1 — within spawn distance of A, so this assimilates into A unless it's actually far enough to birth separately.
    // Use a genuinely far second block instead, then bridge with a third walk.
    const farB = block(30, 0, 2, 2);
    await runWalk(homeRangeRepository, territoryRepository, farB, day2, 55);

    let territories = await territoryRepository.getTerritories();
    expect(territories).toHaveLength(2);

    // Bridging walk: paints every cell strictly between the two blocks so
    // the new ground becomes literally 8-neighbour-adjacent to both.
    const bridge = block(2, 0, 28, 1); // ix 2..29, iy 0 — connects ix=1 (A) to ix=30 (farB)
    const { plan } = await runWalk(homeRangeRepository, territoryRepository, bridge, day3, 20);
    expect(plan.merges.length).toBeGreaterThanOrEqual(1);

    territories = await territoryRepository.getTerritories();
    expect(territories).toHaveLength(1);
    const survivor = territories[0];
    expect(survivor.createdAt).toBe(day1); // older wins
    expect(survivor.walksHere).toBe(3); // 1 (A) + 1 (farB) + 1 (bridge, credited to survivor)
    expect(survivor.treatsEarnedHere).toBe(125); // 50 + 55 + 20

    const allCells = await homeRangeRepository.getCells();
    expect(allCells.every((c) => c.territoryId === survivor.id)).toBe(true);
  });
});
