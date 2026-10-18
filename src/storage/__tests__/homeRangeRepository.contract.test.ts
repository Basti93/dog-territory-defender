import { createInMemoryHomeRangeRepository } from '../inMemoryHomeRangeRepository';

// Matches walkRepository.contract.test.ts's/denEconomyRepository.contract.test.ts's
// existing pattern: the contract is exercised against the in-memory
// implementation only (the sqlite implementation is native-backed and isn't
// exercised under jest anywhere else in this codebase either).

describe('HomeRangeRepository contract', () => {
  it('returns no cells before anything is painted', async () => {
    const repo = createInMemoryHomeRangeRepository();

    expect(await repo.getCells()).toEqual([]);
  });

  it('creates a new cell on first paint', async () => {
    const repo = createInMemoryHomeRangeRepository();

    await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 1000, tracked: true }]);
    const cells = await repo.getCells();

    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ ix: 1, iy: 2, lastRefreshed: 1000, lastTracked: 1000, visits: 1 });
  });

  it('paint idempotency: painting the same cell twice on different calendar days bumps visits but does not double the cell count', async () => {
    const repo = createInMemoryHomeRangeRepository();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    // Different calendar days — docs/decisions/territories.md' anti-farming
    // daily visits cap (see this file's own "daily visits cap" describe
    // block below) only credits one visit per cell per local calendar day,
    // so a same-day repaint would NOT bump visits; two genuinely different
    // days must.
    await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 1000, tracked: true }]);
    await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 1000 + ONE_DAY_MS, tracked: true }]);
    const cells = await repo.getCells();

    expect(cells).toHaveLength(1);
    expect(cells[0].visits).toBe(2);
    expect(cells[0].lastRefreshed).toBe(1000 + ONE_DAY_MS);
  });

  it('lastRefreshed reflects the most recent paint even if paints arrive out of chronological order', async () => {
    const repo = createInMemoryHomeRangeRepository();

    await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 5000, tracked: true }]);
    await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 1000, tracked: true }]); // an older walk, migrated later

    const cells = await repo.getCells();
    expect(cells[0].lastRefreshed).toBe(5000);
  });

  it('lastTracked is only ever set by a tracked: true paint call, never by a refresh', async () => {
    const repo = createInMemoryHomeRangeRepository();

    await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 1000, tracked: true }]);
    // A future (home-range-rewards) manual-log refresh: bumps lastRefreshed, must not touch lastTracked.
    await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 9000, tracked: false }]);

    const cells = await repo.getCells();
    expect(cells[0].lastRefreshed).toBe(9000);
    expect(cells[0].lastTracked).toBe(1000);
  });

  it('a non-tracked paint does not increment visits', async () => {
    const repo = createInMemoryHomeRangeRepository();

    await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 1000, tracked: true }]);
    await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 2000, tracked: false }]);

    const cells = await repo.getCells();
    expect(cells[0].visits).toBe(1);
  });

  it('paints multiple distinct cells from one batch call', async () => {
    const repo = createInMemoryHomeRangeRepository();

    await repo.paintCells([
      { ix: 0, iy: 0, refreshedAt: 1000, tracked: true },
      { ix: 1, iy: 0, refreshedAt: 1000, tracked: true },
      { ix: 0, iy: 1, refreshedAt: 1000, tracked: true },
    ]);

    expect(await repo.getCells()).toHaveLength(3);
  });

  it('getCellsInBounds returns only cells within the inclusive viewport', async () => {
    const repo = createInMemoryHomeRangeRepository();
    await repo.paintCells([
      { ix: -1, iy: -1, refreshedAt: 1000, tracked: true },
      { ix: 0, iy: 0, refreshedAt: 1000, tracked: true },
      { ix: 5, iy: 5, refreshedAt: 1000, tracked: true },
    ]);

    const inBounds = await repo.getCellsInBounds(-1, 0, -1, 0);

    expect(inBounds.map((c) => `${c.ix},${c.iy}`).sort()).toEqual(['-1,-1', '0,0']);
  });

  // docs/decisions/somewhere-wild.md Decision 4 — a single
  // overwritten row, not an event log.
  describe('New Ground event', () => {
    it('reading with no event ever recorded returns null', async () => {
      const repo = createInMemoryHomeRangeRepository();

      expect(await repo.getLastNewGroundEvent()).toBeNull();
    });

    it('recording an event makes it readable back exactly', async () => {
      const repo = createInMemoryHomeRangeRepository();

      await repo.recordNewGroundEvent(1000, ['1,2', '3,4']);

      expect(await repo.getLastNewGroundEvent()).toEqual({ occurredAt: 1000, cellIds: ['1,2', '3,4'] });
    });

    it('recording a new event overwrites the previous one — never appends/accumulates', async () => {
      const repo = createInMemoryHomeRangeRepository();

      await repo.recordNewGroundEvent(1000, ['1,2']);
      await repo.recordNewGroundEvent(2000, ['5,6', '7,8']);

      expect(await repo.getLastNewGroundEvent()).toEqual({ occurredAt: 2000, cellIds: ['5,6', '7,8'] });
    });
  });

  // docs/decisions/territories.md Decision 1 — Cell.territoryId.
  describe('territory membership', () => {
    it('a brand-new cell is created with the territoryId supplied on insert', async () => {
      const repo = createInMemoryHomeRangeRepository();

      await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 1000, tracked: true, territoryId: 't-1' }]);
      const cells = await repo.getCells();

      expect(cells[0].territoryId).toBe('t-1');
    });

    it('a brand-new cell with no territoryId supplied starts null', async () => {
      const repo = createInMemoryHomeRangeRepository();

      await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 1000, tracked: true }]);
      const cells = await repo.getCells();

      expect(cells[0].territoryId).toBeNull();
    });

    it('repainting an existing cell never changes its territoryId, even if a different one is passed', async () => {
      const repo = createInMemoryHomeRangeRepository();

      await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 1000, tracked: true, territoryId: 't-1' }]);
      await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 2000, tracked: true, territoryId: 't-2' }]);
      const cells = await repo.getCells();

      expect(cells[0].territoryId).toBe('t-1');
    });

    it('getCellsByTerritory returns only cells assigned to that territory', async () => {
      const repo = createInMemoryHomeRangeRepository();
      await repo.paintCells([
        { ix: 0, iy: 0, refreshedAt: 1000, tracked: true, territoryId: 't-1' },
        { ix: 1, iy: 0, refreshedAt: 1000, tracked: true, territoryId: 't-2' },
      ]);

      const cellsInT1 = await repo.getCellsByTerritory('t-1');

      expect(cellsInT1.map((c) => `${c.ix},${c.iy}`)).toEqual(['0,0']);
    });

    it('reassignCellsToTerritory bulk-moves every cell from one territory to another', async () => {
      const repo = createInMemoryHomeRangeRepository();
      await repo.paintCells([
        { ix: 0, iy: 0, refreshedAt: 1000, tracked: true, territoryId: 't-1' },
        { ix: 1, iy: 0, refreshedAt: 1000, tracked: true, territoryId: 't-1' },
        { ix: 5, iy: 5, refreshedAt: 1000, tracked: true, territoryId: 't-2' },
      ]);

      await repo.reassignCellsToTerritory('t-1', 't-2');
      const cells = await repo.getCells();

      expect(cells.every((c) => c.territoryId === 't-2')).toBe(true);
    });

    it('reassignCellsToTerritory(null, X) moves every still-unassigned (pre-migration) cell to X', async () => {
      const repo = createInMemoryHomeRangeRepository();
      await repo.paintCells([
        { ix: 0, iy: 0, refreshedAt: 1000, tracked: true },
        { ix: 1, iy: 0, refreshedAt: 1000, tracked: true, territoryId: 't-1' },
      ]);

      await repo.reassignCellsToTerritory(null, 't-2');
      const cells = await repo.getCells();

      expect(cells.find((c) => c.ix === 0)?.territoryId).toBe('t-2');
      expect(cells.find((c) => c.ix === 1)?.territoryId).toBe('t-1');
    });

    it('assignTerritoryToCells sets territoryId on exactly the given cells', async () => {
      const repo = createInMemoryHomeRangeRepository();
      await repo.paintCells([
        { ix: 0, iy: 0, refreshedAt: 1000, tracked: true },
        { ix: 1, iy: 0, refreshedAt: 1000, tracked: true },
      ]);

      await repo.assignTerritoryToCells(['0,0'], 't-1');
      const cells = await repo.getCells();

      expect(cells.find((c) => c.ix === 0)?.territoryId).toBe('t-1');
      expect(cells.find((c) => c.ix === 1)?.territoryId).toBeNull();
    });
  });

  // docs/decisions/territories.md Decision 6 — worldMass must be a
  // single ungrouped aggregate, independent of territory partitioning.
  describe('getWorldMass', () => {
    it('returns zero for an empty range', async () => {
      const repo = createInMemoryHomeRangeRepository();

      expect(await repo.getWorldMass()).toEqual({ cellCount: 0, visitsSum: 0 });
    });

    it('sums cellCount and visits across every cell regardless of territory', async () => {
      const repo = createInMemoryHomeRangeRepository();
      await repo.paintCells([
        { ix: 0, iy: 0, refreshedAt: 1000, tracked: true, territoryId: 't-1' },
        { ix: 1, iy: 0, refreshedAt: 1000, tracked: true, territoryId: 't-2' },
        { ix: 2, iy: 0, refreshedAt: 1000, tracked: true, territoryId: 't-3' },
      ]);
      // Bump visits on one cell with a second, different-day paint.
      await repo.paintCells([{ ix: 0, iy: 0, refreshedAt: 1000 + 24 * 60 * 60 * 1000 * 2, tracked: true, territoryId: 't-1' }]);

      expect(await repo.getWorldMass()).toEqual({ cellCount: 3, visitsSum: 4 });
    });
  });

  // docs/decisions/territories.md Decision 6 — anti-farming visits cap.
  describe('daily visits cap', () => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    it('a second tracked paint on the same calendar day does not increment visits again', async () => {
      const repo = createInMemoryHomeRangeRepository();
      const morning = new Date(2026, 0, 1, 8).getTime();
      const evening = new Date(2026, 0, 1, 20).getTime();

      await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: morning, tracked: true }]);
      await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: evening, tracked: true }]);

      const cells = await repo.getCells();
      expect(cells[0].visits).toBe(1);
      // lastRefreshed still advances even though the visits cap held — the
      // cap is silent and scoped to `visits` alone.
      expect(cells[0].lastRefreshed).toBe(evening);
    });

    it('a tracked paint the following calendar day does increment visits', async () => {
      const repo = createInMemoryHomeRangeRepository();
      const day1 = new Date(2026, 0, 1, 8).getTime();
      const day2 = day1 + ONE_DAY_MS;

      await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: day1, tracked: true }]);
      await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: day2, tracked: true }]);

      const cells = await repo.getCells();
      expect(cells[0].visits).toBe(2);
    });
  });
});
