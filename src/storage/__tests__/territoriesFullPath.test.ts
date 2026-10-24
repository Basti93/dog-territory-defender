// Full-path coverage for the territories change (docs/decisions/territories.md
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
  it('far ground stays home ground (one territory), and territoryRate matches the single ungrouped worldMass', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const day1 = Date.parse('2026-01-01T08:00:00Z');
    const day2 = Date.parse('2026-01-02T08:00:00Z');
    const day3 = Date.parse('2026-01-03T08:00:00Z');

    const home = block(0, 0, 4, 4);
    const { plan: plan1 } = await runWalk(homeRangeRepository, territoryRepository, home, day1, 50);
    expect(plan1.births).toHaveLength(1);

    // A far neighbourhood (4 km away): no new territory until a promotion (2+ walks, 40+ cells).
    const office = block(200, 100, 4, 4);
    const { plan: plan2, creditedId } = await runWalk(homeRangeRepository, territoryRepository, office, day2, 55);
    expect(plan2.births).toHaveLength(0);

    await runWalk(homeRangeRepository, territoryRepository, home, day3, 12);

    const territories = await territoryRepository.getTerritories();
    expect(territories).toHaveLength(1);
    expect(territories[0].id).toBe(creditedId);
    expect(territories[0].walksHere).toBe(3);
    expect(territories[0].treatsEarnedHere).toBe(117);
    expect((await homeRangeRepository.getCells()).every((c) => c.territoryId === territories[0].id)).toBe(true);

    const worldMass = await homeRangeRepository.getWorldMass();
    const allCells = await homeRangeRepository.getCells();
    const manual = territoryMass(allCells.length, allCells.reduce((sum, c) => sum + c.visits, 0));
    expect(territoryRate(territoryMass(worldMass.cellCount, worldMass.visitsSum), 1)).toBe(territoryRate(manual, 1));
  });

  it('a bridging walk that literally connects two shown territories merges them, keeping the older name/id and summing stats', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const day1 = Date.parse('2026-01-01T08:00:00Z');
    const day2 = Date.parse('2026-01-02T08:00:00Z');
    const day3 = Date.parse('2026-01-03T08:00:00Z');

    const a = await territoryRepository.createTerritory('A', day1);
    const b = await territoryRepository.createTerritory('B', day2);
    await territoryRepository.incrementTerritoryStats(a, { walksIncrement: 1, treatsIncrement: 50 });
    await territoryRepository.incrementTerritoryStats(b, { walksIncrement: 2, treatsIncrement: 55 });
    const paint = (set: Set<string>, id: string) =>
      Array.from(set).map((cid) => {
        const [ix, iy] = cid.split(',').map(Number);
        return { ix, iy, refreshedAt: day2, tracked: true, territoryId: id };
      });
    await homeRangeRepository.paintCells([...paint(block(0, 0, 2, 2), a), ...paint(block(30, 0, 2, 2), b)]);

    const { plan } = await runWalk(homeRangeRepository, territoryRepository, block(2, 0, 28, 1), day3, 20);
    expect(plan.merges.length).toBeGreaterThanOrEqual(1);

    const territories = await territoryRepository.getTerritories();
    expect(territories).toHaveLength(1);
    const survivor = territories[0];
    expect(survivor.createdAt).toBe(day1);
    expect(survivor.walksHere).toBe(4); // 1 + 2 + the bridge walk
    expect(survivor.treatsEarnedHere).toBe(125);
    expect((await homeRangeRepository.getCells()).every((c) => c.territoryId === survivor.id)).toBe(true);
  });
});
