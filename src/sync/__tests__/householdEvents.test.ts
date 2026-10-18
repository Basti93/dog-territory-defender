import { setLocale } from '../../i18n';
import type { StoredWalk } from '../../storage/WalkRepository';
import { HOUSEHOLD_NEWS_WINDOW_MS, linesAboutBot, resolveHouseholdLines, resolveNeighbourNote, walkDayPart } from '../householdEvents';

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

describe('neighbour note (fence)', () => {
  const entry = (seq: number, line: string, at: number, botId: string | null = 'b1') => ({
    line,
    botName: 'Momo',
    botId,
    params: { bot: 'Momo' } as Record<string, string | number>,
    at,
    seq,
  });

  it('is not part of the household lines any more (partner news keeps the bubble)', () => {
    const lines = resolveHouseholdLines({ walks: [partnerWalk(at(2026, 10, 18, 8))], myPlayerId: 'p-me', dogName: 'Rex', lastMemberJoined: null, now: NOW });
    expect(lines).toEqual(['Lisa was out with Rex this morning.']);
  });

  it('is the newest line inside the window, with the dog it is about', () => {
    const note = resolveNeighbourNote([entry(1, 'neighbours.line.stickLeft', NOW - 2000), entry(2, 'neighbours.line.sniffCorner', NOW - 1000, 'b2')], NOW);
    expect(note).toEqual({ key: 'neighbour-2', text: 'Momo had a good sniff at your corner today.', botId: 'b2', at: NOW - 1000 });
  });

  it('skips lines that are too old or whose key this app does not know; silence is fine', () => {
    expect(resolveNeighbourNote([entry(1, 'neighbours.line.sniffCorner', NOW - HOUSEHOLD_NEWS_WINDOW_MS - 1)], NOW)).toBeNull();
    expect(resolveNeighbourNote([entry(1, 'neighbours.line.future', NOW - 1)], NOW)).toBeNull();
    expect(resolveNeighbourNote(undefined, NOW)).toBeNull();
    const note = resolveNeighbourNote([entry(2, 'neighbours.line.future', NOW - 1), entry(1, 'neighbours.line.stickLeft', NOW - 2)], NOW);
    expect(note?.text).toBe('Momo left you a stick.');
  });

  it('keeps the co-op line without a dog (nothing to open) and old saved lines without a botId', () => {
    const coop = { ...entry(3, 'neighbours.line.coopDone', NOW - 5, null), botName: null, params: { km: 40 } };
    expect(resolveNeighbourNote([coop], NOW)?.botId).toBeNull();
    const legacy: ReturnType<typeof entry> & { botId?: string | null } = entry(4, 'neighbours.line.wave', NOW - 5);
    delete legacy.botId;
    expect(resolveNeighbourNote([legacy], NOW)?.botId).toBeNull();
  });

  it('lists the last two lines about one dog, newest first, with no age limit', () => {
    const lines = [
      entry(4, 'neighbours.line.wave', NOW - 4, 'b2'),
      entry(3, 'neighbours.line.sniffCorner', NOW - 3),
      entry(2, 'neighbours.line.stickLeft', NOW - HOUSEHOLD_NEWS_WINDOW_MS * 4),
      entry(1, 'neighbours.line.benchRated', NOW - HOUSEHOLD_NEWS_WINDOW_MS * 9),
    ];
    expect(linesAboutBot(lines, 'b1')).toEqual(['Momo had a good sniff at your corner today.', 'Momo left you a stick.']);
    expect(linesAboutBot(lines, 'nobody')).toEqual([]);
  });
});
