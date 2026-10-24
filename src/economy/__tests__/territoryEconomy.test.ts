import * as fs from 'fs';
import * as path from 'path';

import { territoryDisplayRate, territoryMass, territoryRate, TERRITORY_INCOME_DISPLAY_FLOOR } from '../territoryEconomy';

describe('territoryRate', () => {
  // docs/decisions/territories.md Decision 6 — the REQUIRED
  // split-invariance test: an identical total cell/visit count must produce
  // a bit-identical territoryRate whether held as one territory or split
  // across several. This is the concrete, automatable form of the
  // game-economist's non-negotiable correctness constraint.
  it('is split-invariant: one territory vs. three arbitrary territories with the same totals produce the identical rate', () => {
    const totalCells = 12345;
    const totalVisits = 6789;
    const buddyLevel = 7;

    const asOneTerritory = territoryRate(territoryMass(totalCells, totalVisits), buddyLevel);

    // Split arbitrarily across three territories — the split shape must not
    // matter at all, since territoryMass/territoryRate only ever consume
    // the single global totals, never a per-territory breakdown.
    const splits = [
      { cells: 100, visits: 50 },
      { cells: 5000, visits: 2000 },
      { cells: totalCells - 100 - 5000, visits: totalVisits - 50 - 2000 },
    ];
    const worldMassFromSplits = splits.reduce((sum, s) => sum + territoryMass(s.cells, s.visits), 0);
    const asThreeTerritories = territoryRate(worldMassFromSplits, buddyLevel);

    expect(asThreeTerritories).toBe(asOneTerritory);
  });

  it('is split-invariant across an arbitrary number of splits, not just three', () => {
    const totalCells = 900;
    const totalVisits = 450;
    const buddyLevel = 3;
    const asOneTerritory = territoryRate(territoryMass(totalCells, totalVisits), buddyLevel);

    // Split into 9 equal slices of 100 cells / 50 visits each.
    let worldMassFromSplits = 0;
    for (let i = 0; i < 9; i++) {
      worldMassFromSplits += territoryMass(100, 50);
    }
    const asNineTerritories = territoryRate(worldMassFromSplits, buddyLevel);

    expect(asNineTerritories).toBe(asOneTerritory);
  });

  it('increases as worldMass grows, saturating toward R_max = buddyPayout(level)/48', () => {
    const low = territoryRate(territoryMass(10, 0), 5);
    const high = territoryRate(territoryMass(1_000_000, 0), 5);
    expect(high).toBeGreaterThan(low);
  });

  it('scales with Buddy Level at a fixed worldMass', () => {
    const worldMass = territoryMass(50_000, 10_000);
    const atLevel1 = territoryRate(worldMass, 1);
    const atLevel20 = territoryRate(worldMass, 20);
    expect(atLevel20).toBeGreaterThan(atLevel1);
  });

  it('is zero at zero worldMass', () => {
    expect(territoryRate(0, 5)).toBe(0);
  });
});

describe('territoryDisplayRate', () => {
  it('per-territory display rates sum back to the global territoryRate', () => {
    const worldMass = territoryMass(9000, 3000);
    const globalRate = territoryRate(worldMass, 10);

    const massA = territoryMass(1000, 100);
    const massB = territoryMass(8000, 2900);

    const rateA = territoryDisplayRate(massA, worldMass, globalRate);
    const rateB = territoryDisplayRate(massB, worldMass, globalRate);

    expect(rateA + rateB).toBeCloseTo(globalRate, 10);
  });

  it('returns 0 when worldMass is 0 rather than dividing by zero', () => {
    expect(territoryDisplayRate(0, 0, 5)).toBe(0);
  });
});

describe('TERRITORY_INCOME_DISPLAY_FLOOR', () => {
  it('is 0: the income is always visible (was 1 treat/hour until 2026-10-24)', () => {
    expect(TERRITORY_INCOME_DISPLAY_FLOOR).toBe(0);
  });
});

// docs/decisions/territories.md Decision 6: "assert getWorldMass()'s
// underlying query contains no GROUP BY (a static/code-inspection test...)".
describe('HomeRangeRepository.getWorldMass source shape', () => {
  it('the sqlite implementation\'s actual SQL never groups or filters by territoryId', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../storage/sqliteHomeRangeRepository.ts'),
      'utf8'
    );
    const methodStart = source.indexOf('async getWorldMass');
    expect(methodStart).toBeGreaterThan(-1);
    const methodSource = source.slice(methodStart, source.indexOf('},', methodStart));

    // Inspect only the actual SQL string literal(s) passed to the db call —
    // not the surrounding doc comments, which legitimately discuss (and
    // therefore mention the words) "GROUP BY"/"territoryId" as the very
    // thing this method must never do.
    const sqlLiterals = methodSource.match(/'[^']*'/g) ?? [];
    expect(sqlLiterals.length).toBeGreaterThan(0);
    for (const sql of sqlLiterals) {
      expect(sql).not.toMatch(/GROUP BY/i);
      expect(sql).not.toMatch(/territoryId/i);
    }
  });
});
