import {
  AMBIENT_CHANCE,
  WILD_EXTRA_IDS,
  WILD_EXTRA_MS,
  WildExtrasContext,
  getShownThisSession,
  isoDay,
  markShown,
  normalizeLastShown,
  queueWalkTrigger,
  recordShownThisSession,
  resetWildExtrasSession,
  resolveWildExtras,
  takeWalkTrigger,
  triggeredExtras,
  WALK_TRIGGER_TTL_MS,
} from '../den/wildExtras';

// Local time on purpose: the resolver reads local hours. Monday 2026-10-19.
const at = (hour: number, day = 19) => new Date(2026, 9, day, hour, 0, 0).getTime();
const MON_NOON = at(12);

function ctx(over: Partial<WildExtrasContext> = {}): WildExtrasContext {
  const now = over.now ?? MON_NOON;
  return {
    now,
    sessionKind: 'same-day-reopen',
    walkJustClosed: null,
    levelUpJustHappened: false,
    month: 5, // not a rainy month unless a test says so
    lastShown: {},
    shownThisSession: [],
    rng: () => 0,
    ...over,
  };
}
const walk = (over = {}) => ({ distanceKm: 1, isWeekend: false, walkIndex: 3, ...over });

describe('triggeredExtras', () => {
  it('plays nothing on an ordinary midday in spring-ish July', () => {
    const now = new Date(2026, 6, 15, 12).getTime(); // a Wednesday in July
    expect(triggeredExtras(ctx({ now, month: 7 }))).toEqual({ walk: [], ambient: [] });
  });

  it('daisy abduction: only for a weekend walk close', () => {
    expect(triggeredExtras(ctx({ walkJustClosed: walk({ isWeekend: true }) })).walk).toContain('daisy-abduction');
    expect(triggeredExtras(ctx({ walkJustClosed: walk() })).walk).not.toContain('daisy-abduction');
  });

  it('bone comet: only for a long walk', () => {
    expect(triggeredExtras(ctx({ walkJustClosed: walk({ distanceKm: 3.2 }) })).walk).toContain('bone-comet');
    expect(triggeredExtras(ctx({ walkJustClosed: walk({ distanceKm: 2.9 }) })).walk).not.toContain('bone-comet');
  });

  it('mailbox periscope: every 10th walk', () => {
    expect(triggeredExtras(ctx({ walkJustClosed: walk({ walkIndex: 10 }) })).walk).toContain('mailbox-periscope');
    expect(triggeredExtras(ctx({ walkJustClosed: walk({ walkIndex: 20 }) })).walk).toContain('mailbox-periscope');
    expect(triggeredExtras(ctx({ walkJustClosed: walk({ walkIndex: 9 }) })).walk).not.toContain('mailbox-periscope');
    expect(triggeredExtras(ctx({ walkJustClosed: walk({ walkIndex: 0 }) })).walk).not.toContain('mailbox-periscope');
  });

  it('level-up fireflies: on a level-up', () => {
    expect(triggeredExtras(ctx({ levelUpJustHappened: true })).walk).toContain('level-up-fireflies');
  });

  it('moon cheese: at night only', () => {
    expect(triggeredExtras(ctx({ now: at(22) })).ambient).toContain('moon-cheese');
    expect(triggeredExtras(ctx({ now: at(3) })).ambient).toContain('moon-cheese');
    expect(triggeredExtras(ctx({ now: at(12) })).ambient).not.toContain('moon-cheese');
  });

  it('rain-dance squirrel: October and November only', () => {
    expect(triggeredExtras(ctx({ month: 10 })).ambient).toContain('rain-squirrel');
    expect(triggeredExtras(ctx({ month: 11 })).ambient).toContain('rain-squirrel');
    expect(triggeredExtras(ctx({ month: 5 })).ambient).not.toContain('rain-squirrel');
  });

  it('duck parade: first open on a Monday, not a reopen and not another weekday', () => {
    expect(triggeredExtras(ctx({ sessionKind: 'fresh-open' })).ambient).toContain('duck-parade');
    expect(triggeredExtras(ctx({ sessionKind: 'same-day-reopen' })).ambient).not.toContain('duck-parade');
    expect(triggeredExtras(ctx({ sessionKind: 'fresh-open', now: at(12, 20) })).ambient).not.toContain('duck-parade');
  });

  it('tea time: afternoon opens only', () => {
    expect(triggeredExtras(ctx({ now: at(15) })).ambient).toContain('tea-time');
    expect(triggeredExtras(ctx({ now: at(18) })).ambient).not.toContain('tea-time');
    expect(triggeredExtras(ctx({ now: at(9) })).ambient).not.toContain('tea-time');
  });
});

describe('resolveWildExtras', () => {
  it('returns null when nothing is triggered', () => {
    expect(resolveWildExtras(ctx({ now: new Date(2026, 6, 15, 12).getTime(), month: 7 }))).toBeNull();
  });

  it('returns at most one id, always from the triggered set', () => {
    const c = ctx({ walkJustClosed: walk({ isWeekend: true, distanceKm: 5, walkIndex: 10 }), levelUpJustHappened: true, month: 10, now: at(15), sessionKind: 'fresh-open' });
    const { walk: w, ambient } = triggeredExtras(c);
    for (let i = 0; i < 50; i++) {
      const id = resolveWildExtras({ ...c, rng: () => (i % 10) / 10 });
      expect(id).not.toBeNull();
      expect([...w, ...ambient]).toContain(id);
    }
  });

  it('is random among the eligible with a seeded rng, and all walk extras are reachable', () => {
    const c = ctx({ walkJustClosed: walk({ isWeekend: true, distanceKm: 5 }), month: 5 });
    // walk set = [daisy-abduction, bone-comet]; the first draw is the ambient roll, the second the pick
    const seq = (a: number, b: number) => {
      const vals = [a, b];
      return () => vals.shift() ?? 0;
    };
    expect(resolveWildExtras({ ...c, rng: seq(0.9, 0) })).toBe('daisy-abduction');
    expect(resolveWildExtras({ ...c, rng: seq(0.9, 0.99) })).toBe('bone-comet');
  });

  it('ambient extras fire only when the ambient roll is under AMBIENT_CHANCE', () => {
    const c = ctx({ month: 11 });
    const seq = (a: number) => {
      const vals = [a, 0];
      return () => vals.shift() ?? 0;
    };
    expect(resolveWildExtras({ ...c, rng: seq(AMBIENT_CHANCE - 0.01) })).toBe('rain-squirrel');
    expect(resolveWildExtras({ ...c, rng: seq(AMBIENT_CHANCE) })).toBeNull();
  });

  it('walk extras ignore the ambient roll', () => {
    const c = ctx({ levelUpJustHappened: true, month: 5, rng: () => 0.99 });
    expect(resolveWildExtras(c)).toBe('level-up-fireflies');
  });

  it('daily cap: an extra already shown today is skipped, but shows again tomorrow', () => {
    const c = ctx({ levelUpJustHappened: true, rng: () => 0.99 });
    expect(resolveWildExtras({ ...c, lastShown: { 'level-up-fireflies': isoDay(MON_NOON) } })).toBeNull();
    expect(resolveWildExtras({ ...c, lastShown: { 'level-up-fireflies': isoDay(MON_NOON - 24 * 3600 * 1000) } })).toBe('level-up-fireflies');
  });

  it('session de-dupe: never the same extra twice in one session', () => {
    const c = ctx({ levelUpJustHappened: true, rng: () => 0.99 });
    expect(resolveWildExtras({ ...c, shownThisSession: ['level-up-fireflies'] })).toBeNull();
  });

  it('with two eligible and one capped, picks the other', () => {
    const c = ctx({ walkJustClosed: walk({ isWeekend: true, distanceKm: 5 }), lastShown: { 'daisy-abduction': isoDay(MON_NOON) }, month: 5 });
    for (let i = 0; i < 10; i++) expect(resolveWildExtras({ ...c, rng: () => i / 10 })).toBe('bone-comet');
  });
});

describe('lastShown helpers', () => {
  it('markShown records the local day and keeps the others', () => {
    expect(markShown({ 'tea-time': '2026-10-01' }, 'moon-cheese', MON_NOON)).toEqual({ 'tea-time': '2026-10-01', 'moon-cheese': '2026-10-19' });
  });

  it('normalizeLastShown is migration-safe: junk becomes {}, unknown ids and bad days are dropped', () => {
    expect(normalizeLastShown(undefined)).toEqual({});
    expect(normalizeLastShown('x')).toEqual({});
    expect(normalizeLastShown([])).toEqual({});
    expect(normalizeLastShown({ 'tea-time': '2026-10-01', ghost: '2026-10-01', 'moon-cheese': 'yesterday' })).toEqual({ 'tea-time': '2026-10-01' });
  });
});

describe('session store', () => {
  beforeEach(resetWildExtrasSession);

  it('hands the walk trigger over once, then nothing', () => {
    queueWalkTrigger(walk(), true, 1000);
    expect(takeWalkTrigger(2000)).toEqual({ walk: walk(), levelUp: true });
    expect(takeWalkTrigger(2000)).toEqual({ walk: null, levelUp: false });
  });

  it('drops a stale trigger', () => {
    queueWalkTrigger(walk(), true, 1000);
    expect(takeWalkTrigger(1000 + WALK_TRIGGER_TTL_MS + 1)).toEqual({ walk: null, levelUp: false });
  });

  it('remembers what played this session without duplicates', () => {
    recordShownThisSession('tea-time');
    recordShownThisSession('tea-time');
    expect(getShownThisSession()).toEqual(['tea-time']);
  });
});

describe('choreography lengths', () => {
  it('every extra is declared and lasts at most 6 s', () => {
    for (const id of WILD_EXTRA_IDS) {
      expect(WILD_EXTRA_MS[id]).toBeGreaterThan(0);
      expect(WILD_EXTRA_MS[id]).toBeLessThanOrEqual(6000);
    }
  });
});
