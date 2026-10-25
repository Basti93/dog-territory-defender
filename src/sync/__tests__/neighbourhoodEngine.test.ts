import type { ApiClient } from '../apiClient';
import { ApiError } from '../apiClient';
import type { ApiEvent, ApiGift } from '../apiContract';
import { getNearby, getNeighbourhood, resetNeighbourhood, setNeighbourhood } from '../neighbourhoodStore';
import { applyNearby } from '../apply';
import { coopSignText, fillsShelfSlot, giftOpenedLine, stickShelf, unopenedGifts } from '../neighbourhood';
import { setLocale } from '../../i18n';
import { apiDen, IDENTITY, makeEngine, makeRepos, snapshot } from '../../test/syncHelpers';

const gift = (over: Partial<ApiGift> = {}): ApiGift => ({ id: 'g1', botId: 'b1', botName: 'Pfote', cosmeticId: 'stick-oak', sprinkleTreats: 3, createdAt: 1, openedAt: null, ...over });

beforeEach(() => setLocale('en'));

const momoItem = { id: 'b1', kind: 'bot' as const, generated: true as const, archetype: 'momo', dogName: 'Momo', appearance: {}, traitKey: 'k', areaLabel: 'near', lastActiveBucket: 'today' as const, metCount: 1 };
const coopActive = { active: true, weekStart: '2026-10-12', goalKm: 20, totalKm: 5, ratio: 0.25, completed: false, rewardId: null, yardDecorations: [] };
const sniffEvent = (seq: number): ApiEvent => ({
  seq,
  kind: 'neighbour.sniffed' as const,
  actorPlayerId: 'p-lisa',
  createdAt: 5,
  payload: { line: 'neighbours.line.sniffCorner', botName: 'Momo', botId: 'b1', params: { bot: 'Momo' } },
});

beforeEach(() => resetNeighbourhood());

describe('sync engine and the neighbourhood store', () => {
  function scripted(over: Partial<ApiClient> = {}) {
    const calls = { nearby: 0, gifts: 0, coop: 0 };
    const client: Partial<ApiClient> = {
      snapshot: async () => snapshot(),
      events: async (after: number) => ({ events: [], cursor: after, hasMore: false, serverTime: 5 }),
      nearby: async () => {
        calls.nearby++;
        return { items: [momoItem] };
      },
      gifts: async () => {
        calls.gifts++;
        return { gifts: [gift()] };
      },
      coopWeek: async () => {
        calls.coop++;
        return coopActive;
      },
      ...over,
    };
    return { client, calls };
  }

  it('is a quiet no-op when not joined (no network, nothing to show)', async () => {
    const client = { nearby: jest.fn(), gifts: jest.fn(), coopWeek: jest.fn(), openGift: jest.fn() };
    const engine = makeEngine(makeRepos(), client as unknown as Partial<ApiClient>);
    await engine.syncNow();
    await expect(engine.openGift('g1')).resolves.toBe(false);
    expect(client.nearby).not.toHaveBeenCalled();
    expect(getNeighbourhood()).toEqual({ nearby: [], lines: [], gifts: [], coop: null });
  });

  it('one sync fetches the dogs, gifts and co-op week once and publishes them; the next sync without neighbour events fetches nothing', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const { client, calls } = scripted();
    const engine = makeEngine(repos, client);
    await engine.syncNow();
    expect(getNeighbourhood().nearby).toEqual([momoItem]);
    expect(getNeighbourhood().gifts).toEqual([gift()]);
    expect(getNeighbourhood().coop).toEqual(coopActive);
    expect(calls).toEqual({ nearby: 1, gifts: 1, coop: 1 });
    await engine.syncNow({ force: true });
    expect(calls).toEqual({ nearby: 1, gifts: 1, coop: 1 });
  });

  it('a neighbour event triggers exactly one refresh and its line reaches the store', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    let pending = false;
    const { client, calls } = scripted({
      events: async (after: number) => (pending ? { events: [sniffEvent(after + 1)], cursor: after + 1, hasMore: false, serverTime: 5 } : { events: [], cursor: after, hasMore: false, serverTime: 5 }),
    });
    const engine = makeEngine(repos, client);
    await engine.syncNow();
    pending = true;
    await engine.syncNow({ force: true });
    pending = false;
    expect(calls.nearby).toBe(2);
    expect(calls.gifts).toBe(2);
    expect(getNeighbourhood().lines.map((l) => l.line)).toEqual(['neighbours.line.sniffCorner']);
  });

  it('publishes stored lines before reaching the server, and keeps what it has when gifts or the co-op week fail', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const entry = { line: 'neighbours.line.wave', botName: 'Keks', botId: 'b4', params: { bot: 'Keks' }, at: 1, seq: 1 };
    await repos.sync.saveState({ neighbourLines: [entry], cursor: 3, lastSyncAt: 1, territoriesReconciled: true });
    const engine = makeEngine(repos, {
      events: async () => {
        throw new ApiError('network', 'down');
      },
    });
    await engine.syncNow();
    expect(getNeighbourhood().lines).toEqual([entry]);
    setNeighbourhood({ gifts: [gift()] });
    const flaky = makeEngine(repos, {
      events: async (after: number) => ({ events: [], cursor: after, hasMore: false, serverTime: 5 }),
      nearby: async () => ({ items: [momoItem] }),
      gifts: async () => {
        throw new ApiError('network', 'down');
      },
      coopWeek: async () => {
        throw new Error('boom');
      },
    });
    await flaky.syncNow();
    expect(getNeighbourhood().gifts).toEqual([gift()]);
    expect(getNeighbourhood().nearby).toEqual([momoItem]);
  });

  it('empties gifts and the co-op week when the server has no neighbours', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    setNeighbourhood({ gifts: [gift()], coop: coopActive });
    const { client, calls } = scripted({ nearby: async () => ({ items: [] }) });
    await makeEngine(repos, client).syncNow();
    expect(getNeighbourhood().gifts).toEqual([]);
    expect(getNeighbourhood().coop).toBeNull();
    expect(calls.gifts).toBe(0);
  });

  it('opens a gift with a fresh clientId and applies the server Den state (treats sprinkle)', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const openGift = jest.fn(async (_id: string, clientId: string) => ({ clientId, ok: true, replayed: false, den: apiDen({ treats: 777, rev: 9 }), serverTime: 1, seq: 1 }));
    const engine = makeEngine(repos, { openGift });
    const onDenChanged = jest.fn();
    engine.setCallbacks({ onDenChanged });
    setNeighbourhood({ gifts: [gift()] });
    await expect(engine.openGift('g1')).resolves.toBe(true);
    expect(getNeighbourhood().gifts[0].openedAt).not.toBeNull(); // the Post list and the mailbox parcel update without a refetch
    expect(openGift).toHaveBeenCalledWith('g1', expect.any(String));
    expect((await repos.denEconomy.getState()).treats).toBe(777);
    expect(onDenChanged).toHaveBeenCalledWith(expect.objectContaining({ treats: 777 }));
  });

  it('reports false when the open did not work (not found, offline)', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const denied = makeEngine(repos, { openGift: async (_i, clientId) => ({ clientId, ok: false, error: 'not-found', replayed: false, den: apiDen(), serverTime: 1, seq: 1 }) });
    setNeighbourhood({ gifts: [gift({ id: 'x' })] });
    await expect(denied.openGift('x')).resolves.toBe('gone'); // permanent: dropped from the store, no endless retry
    expect(getNeighbourhood().gifts).toEqual([]);
    const offline = makeEngine(repos, {
      openGift: async () => {
        throw new ApiError('timeout', 'slow');
      },
    });
    await expect(offline.openGift('x')).resolves.toBe(false);
  });

  it('forgets the neighbours when the household is left', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    applyNearby({ items: [{ id: 'b1', kind: 'bot', generated: true, archetype: 'momo', dogName: 'Momo', appearance: {}, traitKey: 'k', areaLabel: 'near', lastActiveBucket: 'today', metCount: 1 }] });
    const engine = makeEngine(repos, {});
    await engine.leave();
    expect(getNearby()).toEqual([]);
  });
});

describe('neighbour wording', () => {
  it('words the pickup gently: a stick names its dog, the first one of a dog says where it hangs', () => {
    expect(giftOpenedLine(gift())).toBe('A stick from Pfote!');
    expect(giftOpenedLine(gift(), true)).toBe('A stick from Pfote! It hangs on the stick shelf now.');
    expect(giftOpenedLine(gift({ cosmeticId: 'collar-sky' }))).toBe('Pfote gifted you a collar. It goes with your fur.');
    expect(giftOpenedLine(gift({ cosmeticId: 'sock-odd', botName: 'Nebel' }))).toBe("Nebel left you a sock. It's from somewhere else.");
    expect(giftOpenedLine(gift({ cosmeticId: null }))).toBe('Pfote rolled a few treats into your bowl.');
    expect(giftOpenedLine(gift({ cosmeticId: 'cushion-lotte', botName: 'Lotte' }))).toBe('Lotte left something lovely for you.');
    setLocale('de');
    expect(giftOpenedLine(gift())).toBe('Stock von Pfote!');
  });

  it('the shelf has one slot per dog, filled by opened sticks only; old oak/birch ids land on the sender; duplicates change nothing', () => {
    const slots = (gifts: ApiGift[]) => stickShelf(gifts).filter((s) => s.collected).map((s) => s.id);
    expect(stickShelf([]).map((s) => s.id)).toEqual(['momo', 'pfote', 'bruno', 'keks', 'lotte', 'nebel']);
    expect(slots([])).toEqual([]);
    expect(slots([gift()])).toEqual([]); // still lying in the yard
    expect(slots([gift({ openedAt: 5 })])).toEqual(['pfote']); // the household's existing opened stick-oak
    expect(slots([gift({ openedAt: 5 }), gift({ id: 'g2', cosmeticId: 'stick-pfote', openedAt: 6 })])).toEqual(['pfote']);
    expect(slots([gift({ cosmeticId: 'stick-keks', botName: 'Keks', openedAt: 5 }), gift({ id: 'g3', cosmeticId: 'collar-sky', openedAt: 5 })])).toEqual(['keks']);
    expect(fillsShelfSlot(gift({ cosmeticId: 'stick-momo', botName: 'Momo' }), [gift({ openedAt: 5 })])).toBe(true);
    expect(fillsShelfSlot(gift({ id: 'g4' }), [gift({ openedAt: 5 })])).toBe(false); // a second Pfote stick
    expect(fillsShelfSlot(gift({ cosmeticId: 'collar-sky' }), [])).toBe(false);
  });

  it('keeps only wrapped gifts, and the co-op sign is one percentage, inactive = no sign', () => {
    expect(unopenedGifts([gift(), gift({ id: 'g2', openedAt: 3 })]).map((g) => g.id)).toEqual(['g1']);
    const coop = { active: true, weekStart: 'w', goalKm: 20, totalKm: 8.6, ratio: 0.434, completed: false, rewardId: null, yardDecorations: [] };
    expect(coopSignText(coop)).toBe('Neighbourhood Round: 43%');
    setLocale('de');
    expect(coopSignText({ ...coop, ratio: 7 })).toBe('Viertel-Runde: 100%');
    expect(coopSignText({ ...coop, active: false })).toBeNull();
    expect(coopSignText(null)).toBeNull();
  });
});
