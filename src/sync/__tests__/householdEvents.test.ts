import { setLocale } from '../../i18n';
import type { StoredWalk } from '../../storage/WalkRepository';
import { HOUSEHOLD_NEWS_WINDOW_MS, resolveHouseholdLines, walkDayPart } from '../householdEvents';

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h, 0, 0).getTime();
const NOW = at(2026, 10, 18, 20);

const partnerWalk = (startTime: number, over: Partial<StoredWalk> = {}): StoredWalk => ({
  id: String(startTime),
  startTime,
  locations: [],
  closed: true,
  startSource: 'button',
  syncedAt: 1,
  playerId: 'p-lisa',
  playerName: 'Lisa',
  ...over,
});

beforeEach(() => setLocale('en'));

describe('walkDayPart', () => {
  it('buckets today and yesterday and drops anything older than 48 h', () => {
    expect(walkDayPart(at(2026, 10, 18, 8), NOW)).toBe('morning');
    expect(walkDayPart(at(2026, 10, 18, 14), NOW)).toBe('afternoon');
    expect(walkDayPart(at(2026, 10, 18, 18), NOW)).toBe('evening');
    expect(walkDayPart(at(2026, 10, 17, 18), NOW)).toBe('yesterday');
    expect(walkDayPart(at(2026, 10, 16, 20) - 1, NOW)).toBeNull();
    expect(NOW - at(2026, 10, 16, 20)).toBe(HOUSEHOLD_NEWS_WINDOW_MS);
  });
});

describe('resolveHouseholdLines', () => {
  const base = { myPlayerId: 'p-me', dogName: 'Rex', lastMemberJoined: null, now: NOW };

  it('says the partner was out, without counts or comparisons', () => {
    const lines = resolveHouseholdLines({ ...base, walks: [partnerWalk(at(2026, 10, 18, 8))] });
    expect(lines).toEqual(['Lisa was out with Rex this morning.']);
  });

  it('ignores my own walks, walks without a player name, and old walks; silence is fine', () => {
    const lines = resolveHouseholdLines({
      ...base,
      walks: [
        partnerWalk(at(2026, 10, 18, 8), { playerId: 'p-me' }),
        partnerWalk(at(2026, 10, 18, 9), { playerName: undefined }),
        partnerWalk(at(2026, 10, 10, 9)),
      ],
    });
    expect(lines).toEqual([]);
  });

  it('is empty when not joined and adds a one-off pack line for a recent new member', () => {
    expect(resolveHouseholdLines({ ...base, myPlayerId: null, walks: [partnerWalk(at(2026, 10, 18, 8))] })).toEqual([]);
    const lines = resolveHouseholdLines({ ...base, walks: [], lastMemberJoined: { playerName: 'Lisa', at: NOW - 1000 } });
    expect(lines).toEqual(["Lisa just joined Rex's pack. Welcome!"]);
    expect(resolveHouseholdLines({ ...base, walks: [], lastMemberJoined: { playerName: 'Lisa', at: NOW - HOUSEHOLD_NEWS_WINDOW_MS - 1 } })).toEqual([]);
  });

  it('uses the current name from sync state, so a rename shows on walks and the join line saved earlier', () => {
    const players = { 'p-lisa': 'Lisi' };
    expect(resolveHouseholdLines({ ...base, players, walks: [partnerWalk(at(2026, 10, 18, 8))] })).toEqual(['Lisi was out with Rex this morning.']);
    expect(
      resolveHouseholdLines({ ...base, players, walks: [], lastMemberJoined: { playerName: 'Lisa', at: NOW - 1000, playerId: 'p-lisa' } })
    ).toEqual(["Lisi just joined Rex's pack. Welcome!"]);
  });
});
