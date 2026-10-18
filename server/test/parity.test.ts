// Pins server/src/economy/denTransitions.ts against the app's own implementations
// (src/economy/denEconomy.ts and walkRewards.ts). If a rule changes in the app, this fails until the
// server follows. Test-only imports: the app modules pull in i18n/storage, which the server bundle never does.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@game/utils/log', () => ({ log: () => {} })); // log.ts imports react-native

import { awardWalkRewards } from '@game/economy/walkRewards';
import * as app from '@game/economy/denEconomy';
import { createInMemoryDenEconomyRepository } from '@game/storage/inMemoryDenEconomyRepository';
import { createInMemoryPersonalStatsRepository } from '@game/storage/inMemoryPersonalStatsRepository';
import { createInMemoryWalkRepository } from '@game/storage/inMemoryWalkRepository';
import type { Walk } from '@game/types';
import * as server from '../src/economy/denTransitions';

const T0 = Date.UTC(2026, 9, 1, 10, 0, 0);
const baseApp = (over: Partial<app.DenEconomyState> = {}): app.DenEconomyState => ({
  ...app.defaultDenEconomyState(T0),
  ...over,
});
const toServer = (s: app.DenEconomyState): server.DenState => ({
  treats: s.treats,
  doghouseLevel: s.doghouseLevel,
  bakeryLevel: s.bakeryLevel,
  sniffGardenLevel: s.sniffGardenLevel,
  lastTickAt: s.lastTickAt,
  xp: s.xp,
  level: s.level,
  territoryIncomeRevealed: s.territoryIncomeRevealed,
});

const FIXTURES = [
  baseApp(),
  baseApp({ level: 12, xp: 1800, bakeryLevel: 7, doghouseLevel: 4, sniffGardenLevel: 9, treats: 123.4 }),
  baseApp({ level: 40, xp: 90000, bakeryLevel: 30, doghouseLevel: 20, sniffGardenLevel: 50, treats: 5000 }),
];

describe('server Den transitions match the app', () => {
  it('initial state', () => {
    expect(server.initialDenState(T0)).toEqual(toServer(app.defaultDenEconomyState(T0)));
  });

  it('passive accrual (with and without territory mass)', () => {
    for (const f of FIXTURES) {
      for (const hours of [0, 0.5, 6, 200]) {
        for (const mass of [{ cellCount: 0, visitsSum: 0 }, { cellCount: 900, visitsSum: 2500 }]) {
          const now = f.lastTickAt + hours * 3600_000;
          expect(server.applyPassiveAccrual(toServer(f), now, mass)).toEqual(toServer(app.applyPassiveAccrual(f, now, mass)));
        }
      }
    }
  });

  it('treat and XP awards', () => {
    for (const f of FIXTURES) {
      for (const [mult, bloom] of [[1, 1], [0.5, 1.6], [0.1, 1.112]]) {
        const a = app.awardWalkTreats(f, mult, bloom);
        const sv = server.awardWalkTreats(toServer(f), mult, bloom);
        expect(sv.treatsAwarded).toBe(a.treatsAwarded);
        expect(sv.state).toEqual(toServer(a.state));
        const ax = app.awardWalkXp(a.state, 1800, 60, mult);
        const sx = server.awardWalkXp(sv.state, 1800, 60, mult);
        expect(sx.state).toEqual(toServer(ax.state));
        expect(sx.leveledUp).toBe(ax.leveledUp);
      }
    }
  });

  it('upgrades, including the error cases', () => {
    for (const f of FIXTURES) {
      for (const b of ['doghouse', 'bakery', 'sniffGarden'] as const) {
        const a = app.upgradeBuilding(f, b);
        const sv = server.upgradeBuilding(toServer(f), b);
        if ('error' in a) expect(sv).toEqual(a);
        else expect(sv).toEqual(toServer(a));
      }
    }
    const broke = baseApp({ treats: 1 });
    expect(server.upgradeBuilding(toServer(broke), 'bakery')).toEqual({ error: 'insufficient-treats' });
    const maxed = baseApp({ doghouseLevel: 100, treats: 1e12 });
    expect(server.upgradeBuilding(toServer(maxed), 'doghouse')).toEqual({ error: 'max-level' });
  });

  it('the per-day multiplier matches awardWalkRewards for walks 1..8 of a day', async () => {
    const den = createInMemoryDenEconomyRepository();
    const stats = createInMemoryPersonalStatsRepository();
    const walkRepo = createInMemoryWalkRepository();
    await den.saveState(baseApp({ treats: 0, doghouseLevel: 40 })); // roomy storage so the cap never hides a payout
    const multipliers: number[] = [];
    for (let i = 1; i <= 8; i++) {
      const walk: Walk = { id: `w${i}`, startTime: T0 + i * 60_000, locations: [], closed: true, startSource: 'button' };
      await walkRepo.saveWalk(walk);
      const result = await awardWalkRewards(walk, 0, 0, { denEconomyRepository: den, personalStatsRepository: stats, walkRepository: walkRepo });
      multipliers.push(result.celebration.treatsEarned);
    }
    const full = multipliers[0];
    // level can rise as XP accrues, so compare ratios against the server's own multiplier on the first 6 walks
    expect(multipliers.slice(0, 3)).toEqual([full, full, full]);
    for (let i = 3; i < 6; i++) {
      expect(multipliers[i] / full).toBeCloseTo(server.dailyRewardMultiplier(i + 1), 1);
    }
    expect(server.dailyRewardMultiplier(8)).toBe(0.1);
    expect(server.dailyRewardMultiplier(1)).toBe(1);
  });
});
