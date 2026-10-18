import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { AwayStripDeps, resolveAwayStripLines, resolveDoorstepSession } from '../doorstepSession';
import { setLocale } from '../../i18n';

// These tests assert English copy; pin the locale explicitly.
beforeAll(() => setLocale('en'));

const mockReverseGeocodeAsync = jest.fn();
jest.mock('expo-location', () => ({
  reverseGeocodeAsync: (...args: unknown[]) => mockReverseGeocodeAsync(...args),
}));

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-22T12:00:00Z');

beforeEach(() => {
  mockReverseGeocodeAsync.mockReset();
});

function baseDeps(overrides: Partial<AwayStripDeps> = {}): AwayStripDeps {
  return {
    somewhereWildDeps: {
      homeRangeRepository: createInMemoryHomeRangeRepository(),
      walkRepository: createInMemoryWalkRepository(),
      dogName: 'Buddy',
      now: NOW,
    },
    pendingDenAchievements: [],
    accruedDelta: 0,
    showOverflowLine: false,
    treats: 0,
    ...overrides,
  };
}

describe('resolveDoorstepSession', () => {
  it('same calendar day as the previous open -> same-day-reopen, no greeting flavor', () => {
    const result = resolveDoorstepSession(NOW - 60 * 60 * 1000, NOW);
    expect(result).toEqual({ kind: 'same-day-reopen', greetingFlavor: null });
  });

  it('exactly one calendar day back (yesterday) -> fresh-open, first-open flavor', () => {
    const result = resolveDoorstepSession(NOW - MS_PER_DAY, NOW);
    expect(result.kind).toBe('fresh-open');
    expect(result.greetingFlavor).toBe('first-open');
  });

  it('exactly two calendar days back -> fresh-open, long-absence flavor (the boundary)', () => {
    const result = resolveDoorstepSession(NOW - 2 * MS_PER_DAY, NOW);
    expect(result.kind).toBe('fresh-open');
    expect(result.greetingFlavor).toBe('long-absence');
  });

  it('a much longer absence is still just long-absence — structurally identical, no escalation', () => {
    const result = resolveDoorstepSession(NOW - 60 * MS_PER_DAY, NOW);
    expect(result).toEqual({ kind: 'fresh-open', greetingFlavor: 'long-absence' });
  });

  it('never exposes a numeric day-gap field on its return value (the anti-guilt structural guardrail)', () => {
    const result = resolveDoorstepSession(NOW - 10 * MS_PER_DAY, NOW);
    for (const value of Object.values(result)) {
      expect(typeof value).not.toBe('number');
    }
  });
});

describe('resolveAwayStripLines — priority order (fresh-open)', () => {
  it('with nothing true and the anchor-line roll forced to fail, renders nothing', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99); // >= 0.25, anchor line does not fire
    const lines = await resolveAwayStripLines(baseDeps(), 'fresh-open');
    expect(lines).toEqual([]);
    randomSpy.mockRestore();
  });

  it('with nothing true and the anchor-line roll forced to succeed, renders the flavor-only anchor line', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.01); // < 0.25, anchor line fires
    const lines = await resolveAwayStripLines(baseDeps(), 'fresh-open');
    expect(lines).toEqual([{ text: "Buddy's Bakery bakes faster the more he walks.", kind: 'anchor' }]);
    randomSpy.mockRestore();
  });

  it('an idle-accrued achievement alone shows the "Earned:" line', async () => {
    const lines = await resolveAwayStripLines(baseDeps({ pendingDenAchievements: ['first-steps'] }), 'fresh-open');
    expect(lines).toEqual([{ text: 'Earned: First Steps.', kind: 'achievement' }]);
  });

  it('storage-at-cap wins over plain accrual when both are true', async () => {
    const lines = await resolveAwayStripLines(
      baseDeps({ showOverflowLine: true, accruedDelta: 12, treats: 340 }),
      'fresh-open'
    );
    expect(lines).toEqual([{ text: 'The Doghouse is full — 340 treats waiting.', kind: 'treats' }]);
  });

  it('plain accrual shows the full Bakery sentence on a fresh-open', async () => {
    const lines = await resolveAwayStripLines(baseDeps({ accruedDelta: 7 }), 'fresh-open');
    expect(lines).toEqual([{ text: 'The Treat Bakery baked 7 treats.', kind: 'treats' }]);
  });

  it('all four sources true at once: picks Somewhere Wild, the achievement, and the treats line — capped at 3, no anchor line', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const walkRepository = createInMemoryWalkRepository();
    await homeRangeRepository.recordNewGroundEvent(NOW - MS_PER_DAY / 2, ['0,0', '1,0', '0,1']);
    await walkRepository.saveWalk({
      id: '1',
      startTime: 1,
      locations: [
        { latitude: 0.00001, longitude: 0.00001, timestamp: 1000, accuracy: 5 },
        { latitude: 0.000015, longitude: 0.000015, timestamp: 2000, accuracy: 5 },
      ],
      closed: true,
      startSource: 'button',
    });
    mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Parkweg', district: null, city: null }]);

    const lines = await resolveAwayStripLines(
      baseDeps({
        somewhereWildDeps: { homeRangeRepository, walkRepository, dogName: 'Buddy', now: NOW },
        pendingDenAchievements: ['first-steps'],
        showOverflowLine: true,
        treats: 500,
        accruedDelta: 9, // ignored — showOverflowLine wins
      }),
      'fresh-open'
    );

    expect(lines).toHaveLength(3);
    expect(lines[0].text).toMatch(/^Buddy learned/);
    expect(lines[0].kind).toBe('somewhere-wild');
    expect(lines[1]).toEqual({ text: 'Earned: First Steps.', kind: 'achievement' });
    expect(lines[2]).toEqual({ text: 'The Doghouse is full — 500 treats waiting.', kind: 'treats' });
  });
});

// docs/decisions/territories.md Decision 6 — the one-off
// territory-income discovery beat reuses this away-strip mechanism.
describe('resolveAwayStripLines — territory-income reveal', () => {
  it('shows the reveal line when justRevealedTerritoryIncome is true', async () => {
    const lines = await resolveAwayStripLines(
      baseDeps({ justRevealedTerritoryIncome: true, territoryIncomeRate: 2.4 }),
      'fresh-open'
    );
    expect(lines).toEqual([{ text: "🌍 Buddy's territories bring home ≈2 treats an hour", kind: 'territory-income' }]);
  });

  it('does not show the reveal line on an ordinary open (flag false)', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99); // forces the unrelated anchor-line roll to fail
    const lines = await resolveAwayStripLines(baseDeps({ territoryIncomeRate: 5 }), 'fresh-open');
    expect(lines).toEqual([]);
    randomSpy.mockRestore();
  });

  it('is lower priority than Somewhere Wild/achievement/treats — those still win when also true', async () => {
    const lines = await resolveAwayStripLines(
      baseDeps({ pendingDenAchievements: ['first-steps'], justRevealedTerritoryIncome: true, territoryIncomeRate: 2 }),
      'fresh-open'
    );
    expect(lines[0]).toEqual({ text: 'Earned: First Steps.', kind: 'achievement' });
  });
});

describe('resolveAwayStripLines — same-day-reopen caps to 1, no anchor line, smaller treats phrasing', () => {
  it('caps to the single highest-priority line even when multiple sources are true', async () => {
    const lines = await resolveAwayStripLines(
      baseDeps({ pendingDenAchievements: ['first-steps'], accruedDelta: 5 }),
      'same-day-reopen'
    );
    expect(lines).toEqual([{ text: 'Earned: First Steps.', kind: 'achievement' }]);
  });

  it('uses the shrunk "+N in the bowl" phrasing for plain accrual', async () => {
    const lines = await resolveAwayStripLines(baseDeps({ accruedDelta: 3 }), 'same-day-reopen');
    expect(lines).toEqual([{ text: '+3 in the bowl.', kind: 'treats' }]);
  });

  it('never shows the anchor line even when nothing else is true and the roll would succeed', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const lines = await resolveAwayStripLines(baseDeps(), 'same-day-reopen');
    expect(lines).toEqual([]);
    randomSpy.mockRestore();
  });
});

// Full-path coverage (tasks.md task 7.2, mirroring somewhere-wild's own task
// 8.2 precedent): a synthetic Den/Home-Range/notification-shaped state run
// through both pure functions together end-to-end, not just each in
// isolation.
describe('full path: a synthetic away state produces the expected session + strip', () => {
  it('a player who last opened 3 days ago, with a cleared overflow now fully claimed and a fresh achievement, sees a long-absence greeting and the achievement line', async () => {
    const previousLastTickAt = NOW - 3 * MS_PER_DAY;
    const session = resolveDoorstepSession(previousLastTickAt, NOW);
    expect(session).toEqual({ kind: 'fresh-open', greetingFlavor: 'long-absence' });

    const lines = await resolveAwayStripLines(
      baseDeps({
        pendingDenAchievements: ['paws-on-the-pavement'],
        showOverflowLine: false, // already claimed by App.tsx's merged mount effect in this scenario
        accruedDelta: 4,
        treats: 120,
      }),
      session.kind
    );

    expect(lines).toEqual([
      { text: 'Earned: Paws on the Pavement.', kind: 'achievement' },
      { text: 'The Treat Bakery baked 4 treats.', kind: 'treats' },
    ]);
  });
});
