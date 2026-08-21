import { BALANCE } from '../balanceConfig';
import { CellId, MIN_CELLS_FOR_REWARD } from '../../utils/grid';
import {
  bloomMultiplier,
  buddyPayout,
  buddyTreatsPerWalk,
  cumulativeXpForLevel,
  levelForXp,
  manualLogBloomMultiplier,
  passiveTreatsPerHour,
  sniffGardenPct,
  softCapBonusPercent,
  storageCap,
  upgradeCost,
  xpAwardForWalk,
  xpForNextLevel,
} from '../formulas';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** N distinct synthetic cell ids, only ever used as opaque Set/Map keys here — no real grid geometry needed to exercise bloomMultiplier's math. */
function cellIds(count: number): CellId[] {
  return Array.from({ length: count }, (_, i) => `${i},0`);
}

describe('upgradeCost', () => {
  it('matches costBase * costMult^(level-1) for each building', () => {
    for (const building of ['doghouse', 'bakery', 'sniffGarden'] as const) {
      const { costBase, costMult } = BALANCE.buildings[building];
      for (const level of [1, 2, 5, 10]) {
        expect(upgradeCost(building, level)).toBe(Math.floor(costBase * Math.pow(costMult, level - 1)));
      }
    }
  });

  it('increases with level', () => {
    for (let level = 1; level < 20; level++) {
      expect(upgradeCost('bakery', level + 1)).toBeGreaterThan(upgradeCost('bakery', level));
    }
  });
});

describe('buddyPayout', () => {
  it('matches design.md\'s worked level ladder (round(50 * 1.055^(L-1)))', () => {
    const expected: Record<number, number> = { 1: 50, 2: 53, 10: 81, 20: 138, 30: 236, 50: 689, 100: 10022 };
    for (const [level, value] of Object.entries(expected)) {
      expect(buddyPayout(Number(level))).toBe(value);
    }
  });

  it('level 1 is bit-identical to the flat 50 treats/walk this game shipped with (tasks.md task 3.6)', () => {
    expect(buddyPayout(1)).toBe(50);
  });

  it('steps by a whole digit at every level up to 100 (the fun-floor design.md proves by construction)', () => {
    for (let level = 1; level < 100; level++) {
      expect(buddyPayout(level + 1)).toBeGreaterThan(buddyPayout(level));
    }
  });
});

describe('sniffGardenPct', () => {
  it('matches design.md\'s worked building-level table (renormalized curveRate=25 shape)', () => {
    expect(sniffGardenPct(1)).toBeCloseTo(0.32, 1);
    expect(sniffGardenPct(10)).toBeCloseTo(2.69, 1);
    expect(sniffGardenPct(25)).toBeCloseTo(5.15, 1);
    expect(sniffGardenPct(50)).toBeCloseTo(7.05, 1);
    expect(sniffGardenPct(100)).toBeCloseTo(8.0, 1);
  });

  it('is exactly 8pp (the full anti-snowball budget) at maxBuildingLevel', () => {
    expect(sniffGardenPct(BALANCE.maxBuildingLevel)).toBeCloseTo(BALANCE.sniffGarden.maxBonusPercent, 6);
  });

  it('is monotonically increasing and diminishes above level 50 (den-economy spec scenario)', () => {
    let prev = sniffGardenPct(0);
    for (let level = 1; level <= 100; level++) {
      const next = sniffGardenPct(level);
      expect(next).toBeGreaterThan(prev);
      prev = next;
    }
    const marginalAt50 = sniffGardenPct(50) - sniffGardenPct(49);
    const marginalAt51 = sniffGardenPct(51) - sniffGardenPct(50);
    expect(marginalAt51).toBeLessThan(marginalAt50);
  });
});

describe('buddyTreatsPerWalk', () => {
  it('at buddyLevel=1, sniffGardenLevel=1 rounds to exactly 50 — bit-identical to what shipped before this feature (tasks.md task 3.6)', () => {
    expect(buddyTreatsPerWalk(1, 1)).toBe(50);
  });

  it('combines buddyPayout and sniffGardenPct — the sole source of truth for the walk payout (tasks.md task 3.3)', () => {
    const level = 10;
    const sniffGardenLevel = 25;
    const expected = Math.round(buddyPayout(level) * (1 + sniffGardenPct(sniffGardenLevel) / 100));
    expect(buddyTreatsPerWalk(level, sniffGardenLevel)).toBe(expected);
  });

  it('increases with the Sniff Garden level alone, holding Buddy\'s level fixed', () => {
    expect(buddyTreatsPerWalk(20, 50)).toBeGreaterThan(buddyTreatsPerWalk(20, 1));
  });
});

describe('storageCap', () => {
  it('matches today\'s shipped values at buddyLevel=1 (tasks.md task 8.3)', () => {
    expect(storageCap(1, 1, 1, 1)).toBe(200);
    expect(storageCap(2, 1, 1, 1)).toBe(300);
  });

  it('never falls below 1.25x the cheapest currently-available upgrade (the never-softlock guarantee)', () => {
    // A high Doghouse level with a low Buddy level: the income-based term is
    // small, so the never-softlock floor must be the one doing the work.
    const doghouseLevel = 10;
    const buddyLevel = 1;
    const bakeryLevel = 1;
    const sniffGardenLevel = 1;
    const cheapestUpgrade = Math.min(
      upgradeCost('doghouse', doghouseLevel + 1),
      upgradeCost('bakery', bakeryLevel + 1),
      upgradeCost('sniffGarden', sniffGardenLevel + 1)
    );
    expect(storageCap(doghouseLevel, buddyLevel, bakeryLevel, sniffGardenLevel)).toBeGreaterThanOrEqual(
      1.25 * cheapestUpgrade
    );
  });

  it('grows with Buddy\'s level at a fixed Doghouse level, so income growth never stalls capacity', () => {
    expect(storageCap(5, 50, 5, 5)).toBeGreaterThan(storageCap(5, 1, 5, 5));
  });
});

describe('passiveTreatsPerHour', () => {
  it('scales linearly with Bakery level at buddyLevel=1 — bit-identical to before this feature', () => {
    expect(passiveTreatsPerHour(0, 1)).toBe(0);
    expect(passiveTreatsPerHour(1, 1)).toBe(1);
    expect(passiveTreatsPerHour(12, 1)).toBe(12);
  });

  it('scales with Buddy\'s payout rate so the Bakery does not go stale at high levels', () => {
    expect(passiveTreatsPerHour(5, 50)).toBeGreaterThan(passiveTreatsPerHour(5, 1));
  });
});

describe('softCapBonusPercent', () => {
  it('is monotonically increasing', () => {
    let prev = softCapBonusPercent(0);
    for (let level = 1; level <= 100; level++) {
      const next = softCapBonusPercent(level);
      expect(next).toBeGreaterThan(prev);
      prev = next;
    }
  });

  it('never exceeds maxBonusPercent', () => {
    for (const level of [1, 10, 50, 100, 1000]) {
      expect(softCapBonusPercent(level)).toBeLessThanOrEqual(BALANCE.softCap.maxBonusPercent);
    }
  });

  it('stays strictly below the cap at realistic levels', () => {
    for (const level of [1, 10, 50, 100]) {
      expect(softCapBonusPercent(level)).toBeLessThan(BALANCE.softCap.maxBonusPercent);
    }
  });

  it('is within a few percent of the cap by level 50', () => {
    const atFifty = softCapBonusPercent(50);
    expect(atFifty).toBeGreaterThan(BALANCE.softCap.maxBonusPercent * 0.8);
  });
});

describe('xpAwardForWalk', () => {
  // 20 cells * CELL_M(20)^2 = 8000 m² — the same "typical walk" worked figure
  // this test used before the polygon-area term was replaced with a painted-
  // cell count (openspec/changes/home-range/design.md's "Consequence that
  // must be resolved" section).
  const CELLS_FOR_8000_M2 = 20;

  it('matches the flat base plus distance and painted-ground terms for a typical walk', () => {
    const xp = xpAwardForWalk(1500, CELLS_FOR_8000_M2);
    const expected = BALANCE.xp.perWalkBase + BALANCE.xp.perKm * 1.5 + BALANCE.xp.per1000m2 * 8;
    expect(xp).toBeCloseTo(expected, 5);
  });

  it('caps the painted-ground contribution so an oversized cell count does not inflate XP further', () => {
    // areaCapM2 / (CELL_M^2) = 50 cells — the cap now binds at 50 painted
    // cells (~450m walked), per formulas.ts's xpAwardForWalk doc comment.
    const cellsAtCap = BALANCE.xp.areaCapM2 / 400;
    const atCap = xpAwardForWalk(1000, cellsAtCap);
    const wayOverCap = xpAwardForWalk(1000, cellsAtCap * 10);
    expect(wayOverCap).toBe(atCap);
  });

  it('a huge or GPS-glitched painted-cell count yields the same XP as the cap value', () => {
    const cellsAtCap = BALANCE.xp.areaCapM2 / 400;
    const capped = xpAwardForWalk(500, 12_500); // 5,000,000 m² worth of cells
    const atCap = xpAwardForWalk(500, cellsAtCap);
    expect(capped).toBe(atCap);
  });
});

describe('levelForXp / cumulativeXpForLevel', () => {
  it('round-trips at the worked example levels from design.md', () => {
    for (const level of [5, 10, 20, 30]) {
      const cumulative = cumulativeXpForLevel(level);
      expect(levelForXp(cumulative)).toBe(level);
      expect(levelForXp(cumulative - 1)).toBeLessThan(level);
    }
  });

  it('level 1 requires 0 cumulative XP', () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
    expect(levelForXp(0)).toBe(1);
  });

  it('xpForNextLevel grows with level', () => {
    for (let level = 1; level < 30; level++) {
      expect(xpForNextLevel(level + 1)).toBeGreaterThan(xpForNextLevel(level));
    }
  });

  it('never exceeds maxLevel regardless of how much XP is passed in', () => {
    expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(BALANCE.leveling.maxLevel);
  });
});

// openspec/changes/home-range-rewards/tasks.md task 1.4 — worked table from
// openspec/changes/home-range/design.md Decision 3 (K = 0.6).
describe('bloomMultiplier', () => {
  const NOW = 1_700_000_000_000;

  it('below MIN_CELLS_FOR_REWARD painted cells, the multiplier is always exactly 1 regardless of wildness', () => {
    const ids = cellIds(MIN_CELLS_FOR_REWARD - 1);
    // Every cell is entirely new ground (not in the Range at all) — the
    // wildest possible input, and the multiplier must still be 1.
    expect(bloomMultiplier(new Set(ids), new Map(), NOW)).toBe(1);
  });

  it('same loop walked yesterday (all painted cells refreshed exactly 1 day ago) -> ~x1.112', () => {
    const ids = cellIds(MIN_CELLS_FOR_REWARD);
    const range = new Map(ids.map((id) => [id, NOW - ONE_DAY_MS]));
    expect(bloomMultiplier(new Set(ids), range, NOW)).toBeCloseTo(1.112, 2);
  });

  it('same loop 3 days ago -> ~x1.278', () => {
    const ids = cellIds(MIN_CELLS_FOR_REWARD);
    const range = new Map(ids.map((id) => [id, NOW - 3 * ONE_DAY_MS]));
    expect(bloomMultiplier(new Set(ids), range, NOW)).toBeCloseTo(1.278, 2);
  });

  it('a route last walked a week ago -> ~x1.465', () => {
    const ids = cellIds(MIN_CELLS_FOR_REWARD);
    const range = new Map(ids.map((id) => [id, NOW - 7 * ONE_DAY_MS]));
    expect(bloomMultiplier(new Set(ids), range, NOW)).toBeCloseTo(1.465, 2);
  });

  it('a route 3+ weeks old is at the x1.600 ceiling, same as entirely new ground', () => {
    const ids = cellIds(MIN_CELLS_FOR_REWARD);
    const oldRange = new Map(ids.map((id) => [id, NOW - 30 * ONE_DAY_MS]));
    expect(bloomMultiplier(new Set(ids), oldRange, NOW)).toBeCloseTo(1.6, 2);

    // Entirely new ground: none of the painted cells are in the Range at all.
    expect(bloomMultiplier(new Set(ids), new Map(), NOW)).toBeCloseTo(1.6, 2);
  });

  it('never exceeds the x1.600 ceiling (K=0.6, max wildness=1)', () => {
    const ids = cellIds(MIN_CELLS_FOR_REWARD * 2);
    expect(bloomMultiplier(new Set(ids), new Map(), NOW)).toBeLessThanOrEqual(1 + BALANCE.freshGround.k);
  });

  it('never drops below 1.0 (bigger reward for returning, never a penalty for having left)', () => {
    const ids = cellIds(MIN_CELLS_FOR_REWARD);
    // Every cell refreshed this instant — the freshest possible walk.
    const range = new Map(ids.map((id) => [id, NOW]));
    expect(bloomMultiplier(new Set(ids), range, NOW)).toBeGreaterThanOrEqual(1);
  });

  it('averages wildness across a mix of Range and brand-new cells, not just the new ones', () => {
    const halfKnown = cellIds(MIN_CELLS_FOR_REWARD / 2 + 1);
    const halfNew = cellIds(MIN_CELLS_FOR_REWARD / 2 + 1).map((id) => `new-${id}`);
    const range = new Map(halfKnown.map((id) => [id, NOW])); // freshly refreshed -> wildness 0
    const painted = new Set([...halfKnown, ...halfNew]); // halfNew -> wildness 1 (not in Range)

    const result = bloomMultiplier(painted, range, NOW);
    // Roughly half wild, half fresh -> somewhere strictly between the floor and the ceiling.
    expect(result).toBeGreaterThan(1);
    expect(result).toBeLessThan(1 + BALANCE.freshGround.k);
  });
});

describe('manualLogBloomMultiplier', () => {
  it('matches the exact same value bloomMultiplier would give for a walk refreshed exactly 1 day ago', () => {
    const ids = cellIds(MIN_CELLS_FOR_REWARD);
    const now = 1_700_000_000_000;
    const range = new Map(ids.map((id) => [id, now - ONE_DAY_MS]));
    expect(manualLogBloomMultiplier()).toBeCloseTo(bloomMultiplier(new Set(ids), range, now), 10);
  });

  it('is a true constant, independent of any notion of "now"', () => {
    expect(manualLogBloomMultiplier()).toBe(manualLogBloomMultiplier());
  });

  it('matches design.md\'s worked ~x1.112 figure', () => {
    expect(manualLogBloomMultiplier()).toBeCloseTo(1.112, 2);
  });
});
