import { Walk } from '../../types';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryPersonalStatsRepository } from '../../storage/inMemoryPersonalStatsRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { WalkRepository } from '../../storage/WalkRepository';
import { BALANCE } from '../balanceConfig';
import { buddyPayout, buddyTreatsPerWalk, cumulativeXpForLevel, xpAwardForWalk } from '../formulas';
import { awardWalkRewards } from '../walkRewards';

function makeTrackedWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: 'tracked-1',
    startTime: 1000,
    closed: true,
    startSource: 'button',
    locations: [
      { latitude: 52.5, longitude: 13.4, timestamp: 1000, accuracy: 5 },
      { latitude: 52.5005, longitude: 13.4005, timestamp: 2000, accuracy: 5 },
    ],
    ...overrides,
  };
}

function makeManualWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: 'manual-1',
    startTime: 1000,
    closed: true,
    startSource: 'manual-log',
    locations: [],
    ...overrides,
  };
}

function makeDeps(walkRepository: WalkRepository = createInMemoryWalkRepository()) {
  return {
    denEconomyRepository: createInMemoryDenEconomyRepository(),
    personalStatsRepository: createInMemoryPersonalStatsRepository(),
    walkRepository,
  };
}

// Noon on a fixed day, well away from any local-timezone midnight boundary,
// so offsetting by a few seconds never accidentally crosses into the next
// calendar day.
const DAY_ANCHOR = new Date(2024, 0, 15, 12, 0, 0).getTime();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Seeds `count` already-closed, already-rewarded walks on the given day, so the next awardWalkRewards call sees them as "prior walks today". */
async function seedClosedWalksOnDay(walkRepository: WalkRepository, count: number, dayAnchor: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await walkRepository.saveWalk(makeManualWalk({ id: `seed-${dayAnchor}-${i}`, startTime: dayAnchor + i * 1000 }));
  }
}

describe('awardWalkRewards', () => {
  it('awards the flat per-walk treats amount for a tracked walk', async () => {
    const deps = makeDeps();
    const walk = makeTrackedWalk();

    const result = await awardWalkRewards(walk, 500, 30, deps);

    expect(result.celebration.treatsEarned).toBe(buddyPayout(1));
    expect(result.denEconomyState.treats).toBe(BALANCE.startingTreats + buddyPayout(1));
  });

  it('awards the identical flat per-walk treats amount for a manually-logged walk', async () => {
    const deps = makeDeps();
    const walk = makeManualWalk();

    const result = await awardWalkRewards(walk, 0, 0, deps);

    expect(result.celebration.treatsEarned).toBe(buddyPayout(1));
    expect(result.denEconomyState.treats).toBe(BALANCE.startingTreats + buddyPayout(1));
  });

  it('awards the same base XP for a manual-log walk (distance/cells terms are zero) as the base component of a tracked walk', async () => {
    const trackedDeps = makeDeps();
    const trackedResult = await awardWalkRewards(makeTrackedWalk(), 0, 0, trackedDeps);

    const manualDeps = makeDeps();
    const manualResult = await awardWalkRewards(makeManualWalk(), 0, 0, manualDeps);

    // Both called with distanceMeters=0, cellsPainted=0 — should earn identical base XP.
    expect(manualResult.denEconomyState.xp).toBe(trackedResult.denEconomyState.xp);
    expect(manualResult.denEconomyState.xp).toBe(BALANCE.xp.perWalkBase);
  });

  it('gives a tracked walk more XP than the base when it has real distance/painted ground', async () => {
    const deps = makeDeps();
    const trackedResult = await awardWalkRewards(makeTrackedWalk(), 500, 30, deps);

    expect(trackedResult.denEconomyState.xp).toBeGreaterThan(BALANCE.xp.perWalkBase);
  });

  it('derives hasTerritory/cellsPainted directly from the cellsPainted argument', async () => {
    const trackedDeps = makeDeps();
    const trackedResult = await awardWalkRewards(makeTrackedWalk(), 500, 30, trackedDeps);
    expect(trackedResult.celebration.hasTerritory).toBe(true);
    expect(trackedResult.celebration.cellsPainted).toBe(30);

    const manualDeps = makeDeps();
    const manualResult = await awardWalkRewards(makeManualWalk(), 0, 0, manualDeps);
    expect(manualResult.celebration.hasTerritory).toBe(false);
    expect(manualResult.celebration.cellsPainted).toBe(0);
  });

  it('records the walk in personal stats identically for both a tracked and a manual-log walk', async () => {
    const trackedDeps = makeDeps();
    await awardWalkRewards(makeTrackedWalk(), 500, 30, trackedDeps);
    const trackedStats = await trackedDeps.personalStatsRepository.getState();
    expect(trackedStats.totalWalksClosed).toBe(1);

    const manualDeps = makeDeps();
    await awardWalkRewards(makeManualWalk(), 0, 0, manualDeps);
    const manualStats = await manualDeps.personalStatsRepository.getState();
    expect(manualStats.totalWalksClosed).toBe(1);
  });

  it('unlocks the first-walk achievement for a manual-log walk exactly as it would for a tracked walk', async () => {
    const deps = makeDeps();
    const result = await awardWalkRewards(makeManualWalk(), 0, 0, deps);

    expect(result.newlyUnlockedAchievements).toContain('first-steps');
    expect(result.celebration.unlockedAchievements).toContain('first-steps');
  });

  // docs/decisions/2026-08-21-home-range.md task 6.1: New Ground detection must
  // exist and be tested here, even though the celebration beat/copy for it
  // is deferred to the sibling change home-range-rewards.
  it('carries newGroundCellCount through to the celebration when the caller supplies it', async () => {
    const deps = makeDeps();
    const result = await awardWalkRewards(makeTrackedWalk(), 500, 30, deps, 14);

    expect(result.celebration.newGroundCellCount).toBe(14);
  });

  it('defaults newGroundCellCount to 0 when the caller omits it (e.g. a manual log, which can never discover)', async () => {
    const deps = makeDeps();
    const result = await awardWalkRewards(makeManualWalk(), 0, 0, deps);

    expect(result.celebration.newGroundCellCount).toBe(0);
  });
});

// Exploit mitigation: docs/decisions/2026-08-21-virtual-dog-companion.md's
// "Exploits" table + "Degenerate-exploit mitigations" decision.
describe('awardWalkRewards — per-day diminishing-returns multiplier', () => {
  it.each([0, 1, 2])('pays full treats and full XP base when there are %i prior walks today (i.e. this is walk 1, 2, or 3 of the day)', async (priorCount) => {
    const walkRepository = createInMemoryWalkRepository();
    await seedClosedWalksOnDay(walkRepository, priorCount, DAY_ANCHOR);
    const deps = makeDeps(walkRepository);

    const walk = makeManualWalk({ id: 'today-walk', startTime: DAY_ANCHOR + 999 * 1000 });
    const result = await awardWalkRewards(walk, 0, 0, deps);

    expect(result.celebration.treatsEarned).toBe(buddyPayout(1));
    expect(result.denEconomyState.xp).toBe(BALANCE.xp.perWalkBase);
  });

  it('discounts the 4th walk of the day to 0.5x, the 5th to 0.25x, and the 6th+ to 0.1x — treats and XP flat base only', async () => {
    const expectedMultipliers = [1, 1, 1, 0.5, 0.25, 0.1, 0.1]; // walks 1..7 of the day
    const walkRepository = createInMemoryWalkRepository();

    for (let walkNumber = 1; walkNumber <= expectedMultipliers.length; walkNumber++) {
      // Fresh Den-economy state per walk (xp starts at 0), so the resulting
      // xp/treats after one award *is* that single walk's payout.
      const deps = makeDeps(walkRepository);
      const walk = makeManualWalk({ id: `walk-${walkNumber}`, startTime: DAY_ANCHOR + walkNumber * 1000 });

      const result = await awardWalkRewards(walk, 0, 0, deps);

      const multiplier = expectedMultipliers[walkNumber - 1];
      expect(result.celebration.treatsEarned).toBe(Math.round(buddyPayout(1) * multiplier));
      expect(result.denEconomyState.xp).toBeCloseTo(BALANCE.xp.perWalkBase * multiplier);

      // Persist this walk so the next iteration sees it as a "prior walk today".
      await walkRepository.saveWalk(walk);
    }
  });

  it('never discounts the distance/area XP terms, only the flat base — a genuinely long 4th walk still earns its full distance/area XP', async () => {
    const walkRepository = createInMemoryWalkRepository();
    await seedClosedWalksOnDay(walkRepository, 3, DAY_ANCHOR); // this will be the 4th walk of the day
    const deps = makeDeps(walkRepository);

    const walk = makeTrackedWalk({ id: 'long-4th-walk', startTime: DAY_ANCHOR + 999 * 1000 });
    const result = await awardWalkRewards(walk, 1000, 5, deps); // 1km, 5 cells = 2000m2

    const expectedXp = BALANCE.xp.perWalkBase * 0.5 + BALANCE.xp.perKm * 1 + BALANCE.xp.per1000m2 * (2000 / 1000);
    expect(result.denEconomyState.xp).toBeCloseTo(expectedXp);
  });

  it('resets the walk count on a new calendar day — a walk on the next day pays full value even after 5 walks the day before', async () => {
    const walkRepository = createInMemoryWalkRepository();
    await seedClosedWalksOnDay(walkRepository, 5, DAY_ANCHOR);
    const deps = makeDeps(walkRepository);

    const nextDayWalk = makeManualWalk({ id: 'next-day-walk', startTime: DAY_ANCHOR + ONE_DAY_MS });
    const result = await awardWalkRewards(nextDayWalk, 0, 0, deps);

    expect(result.celebration.treatsEarned).toBe(buddyPayout(1));
    expect(result.denEconomyState.xp).toBe(BALANCE.xp.perWalkBase);
  });
});

// docs/decisions/2026-08-21-virtual-dog-companion.md's level-up beat and
// one-away cliffhanger decisions.
describe('awardWalkRewards — level-up celebration fields', () => {
  it('leaves oldTreatsPerWalk/newTreatsPerWalk/leveledUpTo null when no level-up occurs', async () => {
    const deps = makeDeps();
    const result = await awardWalkRewards(makeTrackedWalk(), 500, 30, deps);

    expect(result.celebration.leveledUpTo).toBeNull();
    expect(result.celebration.oldTreatsPerWalk).toBeNull();
    expect(result.celebration.newTreatsPerWalk).toBeNull();
  });

  it('reports the old and new per-walk rate together when a walk crosses a level threshold, and this walk itself is still paid at the old rate (tasks.md task 10.2)', async () => {
    const denEconomyRepository = createInMemoryDenEconomyRepository();
    const seeded = await denEconomyRepository.getState();
    await denEconomyRepository.saveState({ ...seeded, xp: cumulativeXpForLevel(2) - 5 });
    const deps = {
      denEconomyRepository,
      personalStatsRepository: createInMemoryPersonalStatsRepository(),
      walkRepository: createInMemoryWalkRepository(),
    };

    // 20 (flat base) + 15 (1km) = 35 XP — enough to cross the 5-XP gap to level 2.
    const result = await awardWalkRewards(makeTrackedWalk(), 1000, 0, deps);

    expect(result.celebration.leveledUpTo).toBe(2);
    expect(result.celebration.oldTreatsPerWalk).toBe(buddyTreatsPerWalk(1, 1));
    expect(result.celebration.newTreatsPerWalk).toBe(buddyTreatsPerWalk(2, 1));
    expect(result.celebration.newTreatsPerWalk!).toBeGreaterThan(result.celebration.oldTreatsPerWalk!);
    expect(result.celebration.treatsEarned).toBe(buddyTreatsPerWalk(1, 1));
  });

  it('cliffhangerTitle is the authored title for the upcoming milestone when the trigger condition is met (tasks.md task 5.3)', async () => {
    const denEconomyRepository = createInMemoryDenEconomyRepository();
    const seeded = await denEconomyRepository.getState();
    // cumulativeXpForLevel(2) = 100 (at xpGrowth=1.10) — 25 short, so a 20-XP
    // walk leaves it 5 short of level 2 (a milestone level) after this walk.
    await denEconomyRepository.saveState({ ...seeded, xp: cumulativeXpForLevel(2) - 25 });
    const walkRepository = createInMemoryWalkRepository();
    // 4 prior closed walks, dated well outside this test walk's calendar day
    // so they don't affect its own daily-multiplier order, but do count
    // toward the cliffhanger's trailing-5-walk average.
    for (let i = 0; i < 4; i++) {
      await walkRepository.saveWalk(makeManualWalk({ id: `prior-${i}`, startTime: 1000 + i * 1000 }));
    }
    const deps = { denEconomyRepository, personalStatsRepository: createInMemoryPersonalStatsRepository(), walkRepository };

    const result = await awardWalkRewards(makeManualWalk({ id: 'today', startTime: DAY_ANCHOR }), 0, 0, deps);

    expect(result.celebration.leveledUpTo).toBeNull(); // still 5 XP short of level 2 this walk
    expect(result.celebration.cliffhangerTitle).toBe('Doorstep Sniffer');
  });
});

// docs/decisions/2026-08-21-home-range-rewards.md section 1 + task 5.1 — the
// Home Range's Fresh Ground payout (bloomMultiplier), wired through the full
// walk-close reward path.
describe('awardWalkRewards — Fresh Ground bloomMultiplier', () => {
  it('carries bloomMultiplier through to the celebration, defaulting to 1 when the caller omits it', async () => {
    const deps = makeDeps();
    const result = await awardWalkRewards(makeTrackedWalk(), 500, 30, deps);
    expect(result.celebration.bloomMultiplier).toBe(1);
  });

  it('credits treats matching buddyTreatsPerWalk(...) * bloomMultiplier * dailyMultiplier, rounded once (not compounded through two roundings)', async () => {
    const deps = makeDeps();
    const bloom = 1.465; // design.md's "a route last walked a week ago" worked example
    const denStateBefore = await deps.denEconomyRepository.getState();

    const result = await awardWalkRewards(makeTrackedWalk(), 500, 30, deps, 0, bloom);

    const fullPayout = buddyTreatsPerWalk(denStateBefore.level, denStateBefore.sniffGardenLevel);
    // This is walk 1 of the day, so dailyMultiplier is 1 — isolates the bloom's own arithmetic.
    // (The "rounded once, not compounded through two roundings" guarantee itself is covered by
    // denEconomy.test.ts's awardWalkTreats test, using a level whose payout makes the two paths
    // actually diverge — at dailyMultiplier=1 exactly they're arithmetically indistinguishable.)
    expect(result.celebration.treatsEarned).toBe(Math.round(fullPayout * bloom));
  });

  it('a higher bloomMultiplier earns strictly more treats than an otherwise-identical walk with no bloom effect', async () => {
    const lowDeps = makeDeps();
    const lowResult = await awardWalkRewards(makeTrackedWalk({ id: 'w1' }), 500, 30, lowDeps, 0, 1);

    const highDeps = makeDeps();
    const highResult = await awardWalkRewards(makeTrackedWalk({ id: 'w2' }), 500, 30, highDeps, 0, 1.6);

    expect(highResult.celebration.treatsEarned).toBeGreaterThan(lowResult.celebration.treatsEarned);
  });

  // tasks.md task 1.3 — the easiest place for a future edit to accidentally
  // wire bloomMultiplier into XP too; this pins it down as a regression test.
  it('never applies bloomMultiplier to XP, only to treats', async () => {
    const noBloomDeps = makeDeps();
    const noBloomResult = await awardWalkRewards(makeTrackedWalk({ id: 'w1' }), 500, 30, noBloomDeps, 0, 1);

    const withBloomDeps = makeDeps();
    const withBloomResult = await awardWalkRewards(makeTrackedWalk({ id: 'w2' }), 500, 30, withBloomDeps, 0, 1.6);

    expect(withBloomResult.denEconomyState.xp).toBe(noBloomResult.denEconomyState.xp);
    expect(withBloomResult.denEconomyState.xp).toBe(xpAwardForWalk(500, 30));
    // But treats DID differ — confirms the bloom was actually applied somewhere, just not here.
    expect(withBloomResult.celebration.treatsEarned).toBeGreaterThan(noBloomResult.celebration.treatsEarned);
  });
});

// docs/decisions/2026-08-21-home-range-rewards.md task 5.2 — automates
// docs/decisions/2026-08-21-home-range.md Decision 7's "0.000000 pp" proof:
// bloomMultiplier has no level/building/treat-balance term, so on an
// equivalent walk (same painted-cell wildness) it's the same factor on both
// sides of the Level-100-vs-Level-1 ratio and cancels out identically.
describe('anti-snowball — bloomMultiplier spends 0pp of the Hard Power Gap Soft-Cap budget', () => {
  it('the Level-100 vs Level-1 treats ratio on an equivalent walk is identical with and without the bloom applied', async () => {
    const bloom = 1.465; // "a route last walked a week ago", design.md's own worked example

    async function treatsAt(level: number, bloomMultiplier: number): Promise<number> {
      const deps = makeDeps();
      const seeded = await deps.denEconomyRepository.getState();
      await deps.denEconomyRepository.saveState({ ...seeded, level });
      const result = await awardWalkRewards(makeTrackedWalk(), 500, 30, deps, 0, bloomMultiplier);
      return result.celebration.treatsEarned;
    }

    const l1WithBloom = await treatsAt(1, bloom);
    const l100WithBloom = await treatsAt(100, bloom);
    const l1NoBloom = await treatsAt(1, 1);
    const l100NoBloom = await treatsAt(100, 1);

    const ratioWithBloom = l100WithBloom / l1WithBloom;
    const ratioWithoutBloom = l100NoBloom / l1NoBloom;
    const relativeDrift = Math.abs(ratioWithBloom - ratioWithoutBloom) / ratioWithoutBloom;

    // Rounded-treats ratios can't be bit-identical (each side's treats figure
    // is independently rounded to a whole treat), but that's a rounding
    // artifact of testing through the real award path, not a real
    // level/building/treat-balance term sneaking into bloomMultiplier — well
    // under 1% drift at these magnitudes proves the latter, not the former.
    expect(relativeDrift).toBeLessThan(0.01);
  });
});
