import { BALANCE } from '../balanceConfig';
import { buddyPayout, buddyTreatsPerWalk, upgradeCost, storageCap, cumulativeXpForLevel } from '../formulas';
import { territoryMass, territoryRate } from '../territoryEconomy';
import {
  applyPassiveAccrual,
  awardWalkTreats,
  awardWalkXp,
  canOfferRouteRefreshToday,
  defaultDenEconomyState,
  dogDisplayName,
  evaluateManualLogQuota,
  getUpgradeTease,
  recordManualLogUsage,
  reconcileBuddyLevelCatchUp,
  applyBuddyTap,
  harvestPile,
  upgradeBuilding,
} from '../denEconomy';
import { setLocale } from '../../i18n';

// These tests assert English copy; pin the locale explicitly.
beforeAll(() => setLocale('en'));

const NOW = 1_700_000_000_000;
const HOUR = 1000 * 60 * 60;
const DAY = 24 * HOUR;

describe('defaultDenEconomyState', () => {
  it('starts with the configured starting treats and all buildings at level 1', () => {
    const state = defaultDenEconomyState(NOW);
    expect(state.treats).toBe(BALANCE.startingTreats);
    expect(state.doghouseLevel).toBe(1);
    expect(state.bakeryLevel).toBe(1);
    expect(state.sniffGardenLevel).toBe(1);
    expect(state.lastTickAt).toBe(NOW);
    expect(state.dogName).toBeNull();
    expect(state.cliffhangerShownForLevel).toBeNull();
  });
});

describe('dogDisplayName', () => {
  it('returns the trimmed name when set', () => {
    expect(dogDisplayName('  Buddy  ')).toBe('Buddy');
  });

  it('falls back to "Your dog" (capitalized) or "your pup" (mid-sentence) when unset (tasks.md task 1.3)', () => {
    expect(dogDisplayName(null)).toBe('Your dog');
    expect(dogDisplayName(null, false)).toBe('your pup');
    expect(dogDisplayName('', false)).toBe('your pup');
  });
});

describe('applyPassiveAccrual', () => {
  it('adds the correct amount for elapsed time', () => {
    const state = defaultDenEconomyState(NOW);
    const after = applyPassiveAccrual(state, NOW + 3 * HOUR);
    // bakeryLevel 1, buddyLevel 1 -> 1 treat/hour, 3 hours elapsed
    expect(after.treats).toBe(state.treats); // the bank is untouched, the bakery fills the pile
    expect(after.pile).toBe(3);
    expect(after.lastTickAt).toBe(NOW + 3 * HOUR);
  });

  it('caps accrual at the storage capacity', () => {
    const cap = storageCap(1, 1, 1, 1);
    const state = { ...defaultDenEconomyState(NOW), treats: cap - 0.5, bakeryLevel: 1 };
    const after = applyPassiveAccrual(state, NOW + 10 * HOUR);
    expect(after.treats).toBe(cap - 0.5);
    expect(after.pile).toBeCloseTo(0.5, 9); // bank + pile never pass the cap
    expect(after.treats + after.pile).toBeCloseTo(cap, 9);
  });

  // docs/decisions/territories.md Decision 6 — territoryRate is an
  // additive term on top of the existing Treat Bakery passive rate.
  it('adds territoryRate on top of the existing passive rate when worldMass is supplied', () => {
    const state = { ...defaultDenEconomyState(NOW), bakeryLevel: 1, doghouseLevel: 100 }; // huge storage cap so this test isn't cap-bound
    const worldMass = { cellCount: 50_000, visitsSum: 10_000 };
    const expectedTerritoryRate = territoryRate(territoryMass(worldMass.cellCount, worldMass.visitsSum), state.level);

    const after = applyPassiveAccrual(state, NOW + 1 * HOUR, worldMass);

    expect(after.pile).toBeCloseTo(1 + expectedTerritoryRate, 6);
  });

  it('defaults to zero worldMass (no territory-income contribution) when the caller omits it — existing callers keep working unchanged', () => {
    const state = defaultDenEconomyState(NOW);
    const after = applyPassiveAccrual(state, NOW + 3 * HOUR);
    expect(after.pile).toBe(3);
  });

  // docs/decisions/territories.md Decision 6 — the one-off reveal
  // flag flips permanently once territoryRate first crosses the display
  // floor, and never re-checks backward.
  it('flips territoryIncomeRevealed once territoryRate crosses the display floor, and never resets', () => {
    const state = { ...defaultDenEconomyState(NOW), doghouseLevel: 100 };
    expect(state.territoryIncomeRevealed).toBe(false);

    // A worldMass large enough that territoryRate clears 1 treat/hour at level 1.
    const bigWorldMass = { cellCount: 10_000_000, visitsSum: 10_000_000 };
    const after = applyPassiveAccrual(state, NOW + 1 * HOUR, bigWorldMass);
    expect(after.territoryIncomeRevealed).toBe(true);

    // A later tick with worldMass reset to zero (shouldn't happen in
    // practice — worldMass is monotonic — but confirms the flag never
    // un-reveals even if it did).
    const later = applyPassiveAccrual(after, NOW + 2 * HOUR, { cellCount: 0, visitsSum: 0 });
    expect(later.territoryIncomeRevealed).toBe(true);
  });

  it('reveals at once: the display floor is 0 (income is always visible)', () => {
    const state = defaultDenEconomyState(NOW);
    const after = applyPassiveAccrual(state, NOW + 1 * HOUR, { cellCount: 10, visitsSum: 0 });
    expect(after.territoryIncomeRevealed).toBe(true);
  });
});

describe('awardWalkTreats', () => {
  it('adds buddyTreatsPerWalk at the state\'s level/sniffGardenLevel and returns the awarded amount', () => {
    const state = defaultDenEconomyState(NOW);
    const { state: after, treatsAwarded } = awardWalkTreats(state);

    expect(treatsAwarded).toBe(buddyTreatsPerWalk(state.level, state.sniffGardenLevel));
    expect(after.treats).toBe(state.treats + treatsAwarded);
  });

  it('scales with Buddy\'s level, not a flat constant', () => {
    const lowLevel = { ...defaultDenEconomyState(NOW), level: 1 };
    const highLevel = { ...defaultDenEconomyState(NOW), level: 30 };

    expect(awardWalkTreats(highLevel).treatsAwarded).toBeGreaterThan(awardWalkTreats(lowLevel).treatsAwarded);
  });

  it('caps at storage capacity', () => {
    const cap = storageCap(1, 1, 1, 1);
    const state = { ...defaultDenEconomyState(NOW), treats: cap - 10 };
    const { state: after } = awardWalkTreats(state);
    expect(after.treats).toBe(cap);
  });

  // docs/decisions/2026-08-21-home-range-rewards.md task 1.2/5.1 — bloomMultiplier
  // composes multiplicatively with the daily multiplier in a single Math.round.
  it('bloomMultiplier defaults to 1 (no effect) when omitted', () => {
    const state = defaultDenEconomyState(NOW);
    expect(awardWalkTreats(state).treatsAwarded).toBe(awardWalkTreats(state, 1, 1).treatsAwarded);
  });

  it('applies bloomMultiplier multiplicatively alongside the daily multiplier, rounded once', () => {
    // level 2 (fullPayout=53) deliberately chosen so the naive
    // round-then-round path disagrees with rounding once at the end.
    const state = { ...defaultDenEconomyState(NOW), level: 2 };
    const fullPayout = buddyTreatsPerWalk(state.level, state.sniffGardenLevel);
    expect(fullPayout).toBe(53);

    const { treatsAwarded } = awardWalkTreats(state, 0.5, 1.465);

    expect(treatsAwarded).toBe(Math.round(fullPayout * 0.5 * 1.465));
    // Not the same as rounding each factor separately.
    expect(treatsAwarded).not.toBe(Math.round(Math.round(fullPayout * 0.5) * 1.465));
  });
});

describe('upgradeBuilding', () => {
  it('deducts the correct cost and increments the level', () => {
    const cost = upgradeCost('bakery', 2);
    const state = { ...defaultDenEconomyState(NOW), treats: cost + 5 };
    const result = upgradeBuilding(state, 'bakery');

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.bakeryLevel).toBe(2);
      expect(result.treats).toBe(5);
    }
  });

  it('returns insufficient-treats and changes nothing when too poor', () => {
    const cost = upgradeCost('bakery', 2);
    const state = { ...defaultDenEconomyState(NOW), treats: cost - 1 };
    const result = upgradeBuilding(state, 'bakery');

    expect(result).toEqual({ error: 'insufficient-treats' });
  });

  it('returns max-level and changes nothing at the level cap', () => {
    const state = { ...defaultDenEconomyState(NOW), bakeryLevel: BALANCE.maxBuildingLevel, treats: 1_000_000 };
    const result = upgradeBuilding(state, 'bakery');

    expect(result).toEqual({ error: 'max-level' });
  });
});

describe('awardWalkXp', () => {
  it('accumulates xp across multiple walks without leveling up on a short walk', () => {
    const state = defaultDenEconomyState(NOW);
    const { state: after, leveledUp } = awardWalkXp(state, 500, 2); // 2 painted cells = 800 m²

    expect(after.xp).toBeGreaterThan(0);
    expect(after.level).toBe(1);
    expect(leveledUp).toBe(false);
    expect(after.treats).toBe(state.treats);
  });

  // No more flat treatsPerLevelUp bonus (design.md's "Drop treatsPerLevelUp"
  // decision) — a level-up pays out permanently as a rate via
  // awardWalkTreats instead, so awardWalkXp never touches treats.
  it('levels up exactly once and does not itself change treats — the rate change is consumed by awardWalkTreats on a later walk', () => {
    const state = { ...defaultDenEconomyState(NOW), xp: cumulativeXpForLevel(2) - 5, level: 1 };
    const { state: after, leveledUp } = awardWalkXp(state, 100, 0);

    expect(leveledUp).toBe(true);
    expect(after.level).toBe(2);
    expect(after.treats).toBe(state.treats);
  });

  it('the next walk after a level-up earns treats at the new, higher rate (tasks.md task 10.2)', () => {
    const state = { ...defaultDenEconomyState(NOW), xp: cumulativeXpForLevel(2) - 5, level: 1 };
    const { state: leveledState } = awardWalkXp(state, 100, 0);

    const nextWalkTreats = awardWalkTreats(leveledState).treatsAwarded;
    expect(nextWalkTreats).toBe(buddyTreatsPerWalk(2, leveledState.sniffGardenLevel));
    expect(nextWalkTreats).toBeGreaterThan(buddyPayout(1));
  });

  it('does not level up when xp stays below the next threshold', () => {
    const state = { ...defaultDenEconomyState(NOW), xp: cumulativeXpForLevel(2) - 1000, level: 1 };
    const { leveledUp } = awardWalkXp(state, 1, 1);

    expect(leveledUp).toBe(false);
  });

  it('does not change xp/level as a side effect of upgradeBuilding or applyPassiveAccrual', () => {
    const state = { ...defaultDenEconomyState(NOW), xp: 500, level: 3 };

    const upgraded = upgradeBuilding({ ...state, treats: 1_000_000 }, 'bakery');
    if (!('error' in upgraded)) {
      expect(upgraded.xp).toBe(500);
      expect(upgraded.level).toBe(3);
    }

    const accrued = applyPassiveAccrual(state, NOW + HOUR);
    expect(accrued.xp).toBe(500);
    expect(accrued.level).toBe(3);
  });
});

describe('reconcileBuddyLevelCatchUp', () => {
  it('is a no-op when the stored level already matches (or exceeds, impossible in practice) what the current curve justifies', () => {
    const state = { ...defaultDenEconomyState(NOW), xp: cumulativeXpForLevel(5), level: 5 };
    const { state: after, caughtUpToLevel } = reconcileBuddyLevelCatchUp(state);

    expect(caughtUpToLevel).toBeNull();
    expect(after).toBe(state);
  });

  it('jumps the stored level up and reports the distinct catch-up moment when the current curve justifies a higher level than what is stored', () => {
    // Simulates a save whose level was cached under the old (steeper) xpGrowth
    // curve — its xp now justifies a higher level under the current curve.
    const state = { ...defaultDenEconomyState(NOW), xp: cumulativeXpForLevel(10), level: 5 };
    const { state: after, caughtUpToLevel } = reconcileBuddyLevelCatchUp(state);

    expect(caughtUpToLevel).toBe(10);
    expect(after.level).toBe(10);
    expect(after.xp).toBe(state.xp);
  });
});

describe('getUpgradeTease', () => {
  it('picks the cheapest affordable upgrade', () => {
    // level 1->2 costs: doghouse 60, sniffGarden 72, bakery 96
    const state = { ...defaultDenEconomyState(NOW), treats: 80 };
    const tease = getUpgradeTease(state);

    expect(tease).toEqual({ building: 'doghouse', cost: 60, affordable: true });
  });

  it('falls back to the cheapest overall when nothing is affordable', () => {
    const state = { ...defaultDenEconomyState(NOW), treats: 10 };
    const tease = getUpgradeTease(state);

    expect(tease).toEqual({ building: 'doghouse', cost: 60, affordable: false });
  });

  it('returns null when every building is at max level', () => {
    const state = {
      ...defaultDenEconomyState(NOW),
      doghouseLevel: BALANCE.maxBuildingLevel,
      bakeryLevel: BALANCE.maxBuildingLevel,
      sniffGardenLevel: BALANCE.maxBuildingLevel,
      treats: 1_000_000,
    };

    expect(getUpgradeTease(state)).toBeNull();
  });
});

// docs/decisions/2026-08-21-home-range-rewards.md task 2.5 — manual-log/route-refresh caps.
// design.md Decision 4: at most BALANCE.freshGround.maxManualLogsPerDay manual logs per
// calendar day, of which at most BALANCE.freshGround.maxRouteRefreshesPerDay may refresh a route.
describe('evaluateManualLogQuota / recordManualLogUsage', () => {
  it('a fresh day allows a manual log and, if requested, a route refresh', () => {
    const state = defaultDenEconomyState(NOW);
    const quota = evaluateManualLogQuota(state, NOW, true);
    expect(quota.allowed).toBe(true);
    expect(quota.canRefreshRoute).toBe(true);
  });

  it('does not offer a route refresh when the caller does not ask for one', () => {
    const state = defaultDenEconomyState(NOW);
    expect(evaluateManualLogQuota(state, NOW, false).canRefreshRoute).toBe(false);
  });

  it('allows up to maxManualLogsPerDay manual logs, then rejects the next one on the same day', () => {
    let state = defaultDenEconomyState(NOW);
    for (let i = 0; i < BALANCE.freshGround.maxManualLogsPerDay; i++) {
      expect(evaluateManualLogQuota(state, NOW + i * 1000, false).allowed).toBe(true);
      state = recordManualLogUsage(state, NOW + i * 1000, false);
    }
    // One more, same day: rejected outright (walk-lifecycle: "a third manual log ... is rejected").
    expect(evaluateManualLogQuota(state, NOW + 999_000, false).allowed).toBe(false);
  });

  it('a second same-day manual log is still allowed but silently offers no route refresh once the daily refresh cap is used', () => {
    let state = defaultDenEconomyState(NOW);
    state = recordManualLogUsage(state, NOW, true); // 1st log, with a refresh

    const secondLogQuota = evaluateManualLogQuota(state, NOW + 1000, true);
    expect(secondLogQuota.allowed).toBe(true); // still accepted and rewarded
    expect(secondLogQuota.canRefreshRoute).toBe(false); // but no refresh offered
  });

  it('resets both counters on a new calendar day', () => {
    let state = defaultDenEconomyState(NOW);
    for (let i = 0; i < BALANCE.freshGround.maxManualLogsPerDay; i++) {
      state = recordManualLogUsage(state, NOW + i * 1000, i === 0);
    }
    expect(evaluateManualLogQuota(state, NOW, false).allowed).toBe(false); // maxed out today

    const nextDay = evaluateManualLogQuota(state, NOW + DAY, true);
    expect(nextDay.allowed).toBe(true);
    expect(nextDay.canRefreshRoute).toBe(true); // refresh cap also reset
  });

  it('canOfferRouteRefreshToday mirrors evaluateManualLogQuota(..., true).canRefreshRoute', () => {
    let state = defaultDenEconomyState(NOW);
    expect(canOfferRouteRefreshToday(state, NOW)).toBe(true);

    state = recordManualLogUsage(state, NOW, true);
    expect(canOfferRouteRefreshToday(state, NOW)).toBe(false);
  });

  it('recordManualLogUsage never marks a route refresh used when usedRouteRefresh is false, even on a log that could have carried one', () => {
    const state = defaultDenEconomyState(NOW);
    const after = recordManualLogUsage(state, NOW, false);
    expect(canOfferRouteRefreshToday(after, NOW)).toBe(true);
  });
});

describe('harvest pile', () => {
  it('harvestPile moves the whole pile into the bank and leaves the total alone', () => {
    const state = { ...defaultDenEconomyState(NOW), treats: 10, pile: 7.5 };
    const after = harvestPile(state);
    expect(after.treats).toBe(17.5);
    expect(after.pile).toBe(0);
  });

  it('bank + pile after accrual equals what bank-only accrual gave before (same totals)', () => {
    const state = defaultDenEconomyState(NOW);
    const after = applyPassiveAccrual(state, NOW + 5 * HOUR);
    expect(after.treats + after.pile).toBe(state.treats + 5);
  });

  it('a walk reward banks the pile first, then clamps to the cap', () => {
    const cap = storageCap(1, 1, 1, 1);
    const state = { ...defaultDenEconomyState(NOW), treats: cap - 10, pile: 10 };
    const { state: after } = awardWalkTreats(state);
    expect(after.pile).toBe(0);
    expect(after.treats).toBe(cap);
  });

  it('an upgrade banks the pile first, so a waiting pile pays for it', () => {
    const state = { ...defaultDenEconomyState(NOW), doghouseLevel: 20, treats: 0, pile: 500 };
    const result = upgradeBuilding(state, 'bakery');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.pile).toBe(0);
      expect(result.bakeryLevel).toBe(2);
    }
    expect(getUpgradeTease(state)?.affordable).toBe(true);
  });
});

describe('applyBuddyTap', () => {
  const DAY1 = '2026-10-24';
  const roomy = { ...defaultDenEconomyState(NOW), doghouseLevel: 20, treats: 0 };

  it('pays the roll into the bank and counts the tap', () => {
    const r = applyBuddyTap(roomy, DAY1, 2);
    expect(r.credited).toBe(2);
    expect(r.state.treats).toBe(2);
    expect(r.state.tapCount).toBe(1);
    expect(r.state.tapDayKey).toBe(DAY1);
  });

  it('stops after 30 rewarded taps in a day and starts over the next day', () => {
    let state = roomy;
    for (let i = 0; i < 30; i++) state = applyBuddyTap(state, DAY1, 1).state;
    expect(state.tapCount).toBe(30);
    expect(applyBuddyTap(state, DAY1, 3)).toEqual({ state, credited: 0 });
    expect(applyBuddyTap(state, '2026-10-25', 3).credited).toBe(3);
  });

  it('gives nothing and costs no tap when bank + pile fill the cap', () => {
    const cap = storageCap(1, 1, 1, 1);
    const full = { ...defaultDenEconomyState(NOW), treats: cap - 5, pile: 5 };
    expect(applyBuddyTap(full, DAY1, 3)).toEqual({ state: full, credited: 0 });
  });

  it('trims to the room left under the cap', () => {
    const cap = storageCap(1, 1, 1, 1);
    const nearly = { ...defaultDenEconomyState(NOW), treats: cap - 1 };
    expect(applyBuddyTap(nearly, DAY1, 3).credited).toBe(1);
  });
});
