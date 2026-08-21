import { Cell, HomeRangeRepository, PaintCellInput } from './HomeRangeRepository';

function cellKey(ix: number, iy: number): string {
  return `${ix},${iy}`;
}

export function createInMemoryHomeRangeRepository(): HomeRangeRepository {
  const cells = new Map<string, Cell>();

  return {
    async getCells(): Promise<Cell[]> {
      return Array.from(cells.values());
    },

    async paintCells(input: PaintCellInput[]): Promise<void> {
      for (const { ix, iy, refreshedAt, tracked } of input) {
        const key = cellKey(ix, iy);
        const existing = cells.get(key);

        if (!existing) {
          cells.set(key, {
            ix,
            iy,
            lastRefreshed: refreshedAt,
            // A brand-new cell should only ever be created by a tracked paint
            // (design.md: a refresh can only touch cells already in the
            // Range). If it somehow isn't, lastTracked has nothing honest to
            // record yet — 0 (epoch) reads as "never tracked".
            lastTracked: tracked ? refreshedAt : 0,
            visits: tracked ? 1 : 0,
          });
          continue;
        }

        cells.set(key, {
          ...existing,
          lastRefreshed: Math.max(existing.lastRefreshed, refreshedAt),
          lastTracked: tracked ? Math.max(existing.lastTracked, refreshedAt) : existing.lastTracked,
          visits: tracked ? existing.visits + 1 : existing.visits,
        });
      }
    },

    async getCellsInBounds(minIx: number, maxIx: number, minIy: number, maxIy: number): Promise<Cell[]> {
      return Array.from(cells.values()).filter(
        (c) => c.ix >= minIx && c.ix <= maxIx && c.iy >= minIy && c.iy <= maxIy
      );
    },
  };
}
