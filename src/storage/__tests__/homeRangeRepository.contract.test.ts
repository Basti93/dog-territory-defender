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

  it('paint idempotency: painting the same cell twice bumps visits but does not double the cell count', async () => {
    const repo = createInMemoryHomeRangeRepository();

    await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 1000, tracked: true }]);
    await repo.paintCells([{ ix: 1, iy: 2, refreshedAt: 2000, tracked: true }]);
    const cells = await repo.getCells();

    expect(cells).toHaveLength(1);
    expect(cells[0].visits).toBe(2);
    expect(cells[0].lastRefreshed).toBe(2000);
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
});
