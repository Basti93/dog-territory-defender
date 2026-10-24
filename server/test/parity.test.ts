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
import { storageCap, upgradeCost } from '@game/economy/formulas';
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
  pile: s.pile,
  tapDayKey: s.tapDayKey,
  tapCount: s.tapCount,
});

const FIXTURES = [
  baseApp(),
  baseApp({ level: 12, xp: 1800, bakeryLevel: 7, doghouseLevel: 4, sniffGardenLevel: 9, treats: 123.4 }),
  baseApp({ level: 40, xp: 90000, bakeryLevel: 30, doghouseLevel: 20, sniffGardenLevel: 50, treats: 5000 }),
  baseApp({ level: 12, xp: 1800, bakeryLevel: 7, doghouseLevel: 4, sniffGardenLevel: 9, treats: 123.4, pile: 40.5 }),
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

  it('harvest: bank + pile after accrual equals what the old bank-only accrual gave; harvestAt matches the app', () => {
    for (const f of FIXTURES) {
      for (const hours of [0.5, 6, 200]) {
        const now = f.lastTickAt + hours * 3600_000;
        const mass = { cellCount: 100, visitsSum: 300 };
        const piled = app.applyPassiveAccrual(f, now, mass);
        const bankOnly = app.applyPassiveAccrual({ ...f, treats: f.treats + f.pile, pile: 0 }, now, mass);
        expect(piled.treats + piled.pile).toBeCloseTo(bankOnly.treats + bankOnly.pile, 6);
        const cap = storageCap(f.doghouseLevel, f.level, f.bakeryLevel, f.sniffGardenLevel);
        expect(piled.treats + piled.pile).toBeLessThanOrEqual(cap + 1e-9);
        const sv = server.harvestAt(toServer(f), now, mass);
        expect(sv).toEqual(toServer(app.harvestPile(piled)));
        expect(sv.pile).toBe(0);
      }
    }
  });

  it('walk reward banks the pile first and clamps to the cap like the app', () => {
    const f = baseApp({ doghouseLevel: 1, treats: 10, pile: 30 });
    const a = app.awardWalkTreats(f, 1, 1);
    expect(a.state.pile).toBe(0);
    expect(a.state.treats).toBeGreaterThanOrEqual(40);
    expect(server.awardWalkTreats(toServer(f), 1, 1).state).toEqual(toServer(a.state));
  });

  it('an upgrade banks the pile first (the pile makes it affordable)', () => {
    const cost = upgradeCost('bakery', 2);
    const f = baseApp({ treats: 0, pile: cost + 5, doghouseLevel: 20 });
    const a = app.upgradeBuilding(f, 'bakery');
    expect('error' in a).toBe(false);
    expect(server.upgradeBuilding(toServer(f), 'bakery')).toEqual(toServer(a as app.DenEconomyState));
    expect((a as app.DenEconomyState).pile).toBe(0);
  });

  it('Buddy taps: app single tap and server batch agree; 30 per day, full bank costs no tap, day rollover', () => {
    const day = '2026-10-01';
    let a = baseApp({ doghouseLevel: 20, treats: 0 });
    let credited = 0;
    for (let i = 0; i < 40; i++) {
      const r = app.applyBuddyTap(a, day, (i % 3) + 1);
      a = r.state;
      credited += r.credited;
    }
    expect(a.tapCount).toBe(30);
    expect(a.treats).toBe(credited);
    const sv = server.applyBuddyTaps(toServer(baseApp({ doghouseLevel: 20, treats: 0 })), day, 40, credited);
    expect(sv.tapCount).toBe(30);
    expect(sv.treats).toBeLessThanOrEqual(credited);
    expect(app.applyBuddyTap(a, '2026-10-02', 2).credited).toBe(2); // next day
    const full = baseApp({ treats: storageCap(1, 1, 1, 1) });
    expect(app.applyBuddyTap(full, day, 3)).toEqual({ state: full, credited: 0 });
    expect(server.applyBuddyTaps(toServer(full), day, 5, 10)).toEqual(toServer(full));
    // room for 2 only: 2 treats, and only the taps that paid are counted
    const nearFull = baseApp({ treats: storageCap(1, 1, 1, 1) - 2 });
    const trimmed = server.applyBuddyTaps(toServer(nearFull), day, 5, 12);
    expect(trimmed.treats - nearFull.treats).toBe(2);
    expect(trimmed.tapCount).toBe(2);
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
