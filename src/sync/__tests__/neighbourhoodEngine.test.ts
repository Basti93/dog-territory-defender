import type { ApiClient } from '../apiClient';
import { ApiError } from '../apiClient';
import type { ApiGift } from '../apiContract';
import { getNearby } from '../nearbyStore';
import { applyNearby } from '../apply';
import { coopSignText, giftOpenedLine, giftThing, unopenedGifts } from '../neighbourhood';
import { setLocale } from '../../i18n';
import { apiDen, IDENTITY, makeEngine, makeRepos } from '../../test/syncHelpers';

const gift = (over: Partial<ApiGift> = {}): ApiGift => ({ id: 'g1', botId: 'b1', botName: 'Pfote', cosmeticId: 'stick-oak', sprinkleTreats: 3, createdAt: 1, openedAt: null, ...over });

beforeEach(() => setLocale('en'));

describe('sync engine neighbour calls', () => {
  it('are quiet no-ops when not joined (no network, nothing to show)', async () => {
    const client = { gifts: jest.fn(), coopWeek: jest.fn(), openGift: jest.fn() };
    const engine = makeEngine(makeRepos(), client as unknown as Partial<ApiClient>);
    await expect(engine.listGifts()).resolves.toEqual([]);
    await expect(engine.coopWeek()).resolves.toBeNull();
    await expect(engine.openGift('g1')).resolves.toBe(false);
    expect(client.gifts).not.toHaveBeenCalled();
  });

  it('lists gifts and the co-op week, and swallows failures', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const coop = { active: true, weekStart: '2026-10-12', goalKm: 20, totalKm: 5, ratio: 0.25, completed: false, rewardId: null, yardDecorations: [] };
    const engine = makeEngine(repos, { gifts: async () => ({ gifts: [gift()] }), coopWeek: async () => coop });
    await expect(engine.listGifts()).resolves.toEqual([gift()]);
    await expect(engine.coopWeek()).resolves.toEqual(coop);
    const failing = makeEngine(repos, {
      gifts: async () => {
        throw new ApiError('network', 'down');
      },
      coopWeek: async () => {
        throw new Error('boom');
      },
    });
    await expect(failing.listGifts()).resolves.toEqual([]);
    await expect(failing.coopWeek()).resolves.toBeNull();
  });

  it('opens a gift with a fresh clientId and applies the server Den state (treats sprinkle)', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const openGift = jest.fn(async (_id: string, clientId: string) => ({ clientId, ok: true, replayed: false, den: apiDen({ treats: 777, rev: 9 }), serverTime: 1, seq: 1 }));
    const engine = makeEngine(repos, { openGift });
    const onDenChanged = jest.fn();
    engine.setCallbacks({ onDenChanged });
    await expect(engine.openGift('g1')).resolves.toBe(true);
    expect(openGift).toHaveBeenCalledWith('g1', expect.any(String));
    expect((await repos.denEconomy.getState()).treats).toBe(777);
    expect(onDenChanged).toHaveBeenCalledWith(expect.objectContaining({ treats: 777 }));
  });

  it('reports false when the open did not work (not found, offline)', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const denied = makeEngine(repos, { openGift: async (_i, clientId) => ({ clientId, ok: false, error: 'not-found', replayed: false, den: apiDen(), serverTime: 1, seq: 1 }) });
    await expect(denied.openGift('x')).resolves.toBe(false);
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

  it('exposes the stored neighbour lines', async () => {
    const repos = makeRepos();
    const engine = makeEngine(repos, {});
    await expect(engine.neighbourLines()).resolves.toEqual([]);
    const entry = { line: 'neighbours.line.wave', botName: 'Keks', botId: 'b4', params: { bot: 'Keks' }, at: 1, seq: 1 };
    await repos.sync.saveState({ neighbourLines: [entry] });
    await expect(engine.neighbourLines()).resolves.toEqual([entry]);
  });
});

describe('neighbour wording', () => {
  it('names what is in a parcel and words the opening gently (reusing the game-master lines)', () => {
    expect(giftThing(gift())).toBe('Oak stick');
    expect(giftThing(gift({ cosmeticId: null }))).toBe('A few treats');
    expect(giftThing(gift({ cosmeticId: 'hat-from-the-future' }))).toBe('A little surprise');
    expect(giftOpenedLine(gift())).toBe('Pfote left you a stick.');
    expect(giftOpenedLine(gift({ cosmeticId: 'collar-sky' }))).toBe('Pfote gifted you a collar. It goes with your fur.');
    expect(giftOpenedLine(gift({ cosmeticId: 'sock-odd', botName: 'Nebel' }))).toBe("Nebel left you a sock. It's from somewhere else.");
    expect(giftOpenedLine(gift({ cosmeticId: null }))).toBe('Pfote rolled a few treats into your bowl.');
    expect(giftOpenedLine(gift({ cosmeticId: 'cushion-lotte', botName: 'Lotte' }))).toBe('Lotte left something lovely for you.');
    setLocale('de');
    expect(giftOpenedLine(gift())).toBe('Pfote hat dir einen Stock dagelassen.');
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
