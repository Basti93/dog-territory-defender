import { ApiError } from '../apiClient';
import type { ApiMyStats } from '../apiContract';
import { IDENTITY, jsonResponse, engineWithFetch, makeEngine, makeRepos, snapshot, apiDen } from '../../test/syncHelpers';
import { ACHIEVEMENTS, defaultPersonalStatsState } from '../../economy/personalStats';
import { ACHIEVEMENT_ID_PATTERN } from '../apiContract';

const zero = defaultPersonalStatsState();
const remoteDoc = (stats: Partial<ApiMyStats['stats']> = {}, achievements: ApiMyStats['achievements'] = []): ApiMyStats => ({ stats: { ...zero, ...stats }, achievements });
const emptyEvents = { events: [], cursor: 7, hasMore: false, serverTime: 2_000 };

async function joined() {
  const repos = makeRepos();
  await repos.settings.saveSyncIdentity(IDENTITY);
  await repos.sync.saveState({ cursor: 7, lastSyncAt: 1 }); // events path, no snapshot
  return repos;
}

describe('stats sync: merging the server copy in', () => {
  const firstSnapshotEngine = (repos: ReturnType<typeof makeRepos>, myStats: ApiMyStats | undefined, putMyStats = jest.fn(async (r: ApiMyStats) => r)) => {
    const engine = makeEngine(repos, {
      snapshot: async () => snapshot({ myStats, walks: [{ id: 'w', playerId: 'p-lisa', startTime: 1, startSource: 'button', closed: true, newGroundCellIds: [], treatsEarned: 1, deleted: false }], den: apiDen({ rev: 1 }) }),
      getWalk: async () => null,
      events: async () => emptyEvents,
      nearby: async () => ({ items: [] }),
      putMyStats,
    });
    return { engine, putMyStats };
  };

  it('raises the local stats and achievements silently, with the original unlock dates', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const onHouseholdNews = jest.fn();
    const { engine, putMyStats } = firstSnapshotEngine(
      repos,
      remoteDoc({ totalWalksClosed: 42, lifetimeDistanceMeters: 80_000, firstWalkAt: 500 }, [{ id: 'first-steps', unlockedAt: 500 }, { id: 'hundred-walks', unlockedAt: 900 }])
    );
    engine.setCallbacks({ onHouseholdNews });
    await engine.syncNow();

    expect(await repos.stats.getState()).toMatchObject({ totalWalksClosed: 42, lifetimeDistanceMeters: 80_000, firstWalkAt: 500 });
    expect(await repos.stats.getUnlockedAchievements()).toEqual([{ id: 'first-steps', unlockedAt: 500 }, { id: 'hundred-walks', unlockedAt: 900 }]);
    expect(putMyStats).not.toHaveBeenCalled(); // the server already has everything: nothing to send back
  });

  it('never lowers a local value and keeps the earlier date; local extras are then uploaded', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    await repos.stats.saveState({ ...zero, totalWalksClosed: 60, lifetimeDistanceMeters: 10, firstWalkAt: 100 });
    await repos.stats.unlockAchievements(['first-steps'], 100);
    const { engine, putMyStats } = firstSnapshotEngine(repos, remoteDoc({ totalWalksClosed: 5, lifetimeDistanceMeters: 999, firstWalkAt: 400 }, [{ id: 'first-steps', unlockedAt: 400 }]));
    await engine.syncNow();

    expect(await repos.stats.getState()).toMatchObject({ totalWalksClosed: 60, lifetimeDistanceMeters: 999, firstWalkAt: 100 });
    expect(await repos.stats.getUnlockedAchievements()).toEqual([{ id: 'first-steps', unlockedAt: 100 }]);
    expect(putMyStats).toHaveBeenCalledTimes(1); // local 60 walks > server 5
  });

  it('keeps ids this app cannot draw on the server and out of the local badge list', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const { engine } = firstSnapshotEngine(repos, remoteDoc({}, [{ id: 'badge-from-the-future', unlockedAt: 5 }, { id: 'moving-in', unlockedAt: 6 }]));
    await engine.syncNow();
    expect((await repos.stats.getUnlockedAchievements()).map((a) => a.id)).toEqual(['moving-in']);
  });

  it('works against a server that sends no myStats', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const { engine, putMyStats } = firstSnapshotEngine(repos, undefined);
    await engine.syncNow();
    expect(await repos.stats.getState()).toEqual(zero);
    expect(putMyStats).not.toHaveBeenCalled();
  });
});

describe('stats sync: uploading', () => {
  it('sends the full state once when it is new, then nothing while unchanged', async () => {
    const repos = await joined();
    await repos.stats.saveState({ ...zero, totalWalksClosed: 3, firstWalkAt: 1_234.6 });
    await repos.stats.unlockAchievements(['first-steps'], 1_234.6);
    const putMyStats = jest.fn(async (r: ApiMyStats) => r);
    const clock = { now: 1_000_000 };
    const engine = makeEngine(repos, { events: async () => emptyEvents, putMyStats }, clock);

    await engine.syncNow();
    expect(putMyStats).toHaveBeenCalledTimes(1);
    expect(putMyStats).toHaveBeenCalledWith({ stats: { ...zero, totalWalksClosed: 3, firstWalkAt: 1_235 }, achievements: [{ id: 'first-steps', unlockedAt: 1_235 }] });

    clock.now += 10 * 60_000;
    await engine.syncNow({ foreground: true });
    expect(putMyStats).toHaveBeenCalledTimes(1); // not dirty (fractional ms did not make it dirty either)
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 0 }); // never an outbox row
  });

  it('after a change: at most every 60 s, or at once on foreground', async () => {
    const repos = await joined();
    await repos.stats.saveState({ ...zero, totalWalksClosed: 1 });
    const putMyStats = jest.fn(async (r: ApiMyStats) => r);
    const clock = { now: 1_000_000 };
    const engine = makeEngine(repos, { events: async () => emptyEvents, putMyStats }, clock);
    await engine.syncNow();
    expect(putMyStats).toHaveBeenCalledTimes(1);

    await repos.stats.saveState({ ...zero, totalWalksClosed: 2 });
    clock.now += 30_000;
    await engine.syncNow();
    expect(putMyStats).toHaveBeenCalledTimes(1); // too soon
    clock.now += 31_000;
    await engine.syncNow();
    expect(putMyStats).toHaveBeenCalledTimes(2);

    await repos.stats.saveState({ ...zero, totalWalksClosed: 3 });
    clock.now += 1_000;
    await engine.syncNow({ foreground: true });
    expect(putMyStats).toHaveBeenCalledTimes(3);
  });

  it('applies the merged answer to the local stats (another phone of the same player), without a celebration', async () => {
    const repos = await joined();
    await repos.stats.saveState({ ...zero, totalWalksClosed: 1 });
    const putMyStats = jest.fn(async () => remoteDoc({ totalWalksClosed: 8 }, [{ id: 'paws-on-the-pavement', unlockedAt: 77 }]));
    const engine = makeEngine(repos, { events: async () => emptyEvents, putMyStats });
    const onHouseholdNews = jest.fn();
    engine.setCallbacks({ onHouseholdNews });
    await engine.syncNow();
    expect((await repos.stats.getState()).totalWalksClosed).toBe(8);
    expect(await repos.stats.getUnlockedAchievements()).toEqual([{ id: 'paws-on-the-pavement', unlockedAt: 77 }]);
    expect(onHouseholdNews).not.toHaveBeenCalled();
    await engine.syncNow({ foreground: true });
    expect(putMyStats).toHaveBeenCalledTimes(1); // local == confirmed now
  });

  it('sends nothing for a player without progress', async () => {
    const repos = await joined();
    const putMyStats = jest.fn(async (r: ApiMyStats) => r);
    await makeEngine(repos, { events: async () => emptyEvents, putMyStats }).syncNow();
    expect(putMyStats).not.toHaveBeenCalled();
  });

  it('waits for the first snapshot after a join: a failed first pull uploads nothing', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    await repos.stats.saveState({ ...zero, totalWalksClosed: 4 });
    const putMyStats = jest.fn(async (r: ApiMyStats) => r);
    const failing = makeEngine(repos, { snapshot: async () => { throw new ApiError('network', 'offline'); }, putMyStats });
    await failing.syncNow();
    expect(putMyStats).not.toHaveBeenCalled();
  });

  it('treats a 404 from an older server quietly and stops asking until the next app start', async () => {
    const repos = await joined();
    await repos.stats.saveState({ ...zero, totalWalksClosed: 1 });
    const putMyStats = jest.fn(async () => { throw new ApiError('client', 'HTTP 404 not_found', 404, 'not_found'); });
    const clock = { now: 1_000_000 };
    const engine = makeEngine(repos, { events: async () => emptyEvents, putMyStats }, clock);
    await engine.syncNow();
    await repos.stats.saveState({ ...zero, totalWalksClosed: 2 });
    clock.now += 5 * 60_000;
    await engine.syncNow({ foreground: true });
    expect(putMyStats).toHaveBeenCalledTimes(1);
    expect((await engine.getStatus()).unauthorized).toBe(false);
    expect((await repos.sync.getState()).lastSyncAt).toBe(clock.now); // the rest of the sync was unaffected

    // a new app start (new engine) tries again
    const restarted = makeEngine(repos, { events: async () => emptyEvents, putMyStats: jest.fn(async (r: ApiMyStats) => r) }, clock);
    await restarted.syncNow();
  });

  it('retries after offline errors on the next allowed attempt', async () => {
    const repos = await joined();
    await repos.stats.saveState({ ...zero, totalWalksClosed: 1 });
    const putMyStats = jest.fn()
      .mockRejectedValueOnce(new ApiError('network', 'offline'))
      .mockImplementation(async (r: ApiMyStats) => r);
    const clock = { now: 1_000_000 };
    const engine = makeEngine(repos, { events: async () => emptyEvents, putMyStats }, clock);
    await engine.syncNow();
    clock.now += 61_000;
    await engine.syncNow();
    expect(putMyStats).toHaveBeenCalledTimes(2);
  });

  it('flags an unauthorized token like any other call', async () => {
    const repos = await joined();
    await repos.stats.saveState({ ...zero, totalWalksClosed: 1 });
    const engine = makeEngine(repos, { events: async () => emptyEvents, putMyStats: async () => { throw new ApiError('unauthorized', 'HTTP 401', 401); } });
    await engine.syncNow();
    expect((await engine.getStatus()).unauthorized).toBe(true);
  });
});

describe('restore flow: joining with a for-player invite', () => {
  const restoreBody = { token: 'secret2', householdId: 'h1', householdName: 'Haus', playerId: 'p-me', deviceId: 'd2', serverTime: 1, seq: 7, restored: true, playerName: 'Sam Original' };
  const mkFetch = (calls: string[]) =>
    (async (url: string) => {
      calls.push(url.replace('https://example.test', ''));
      if (url.endsWith('/v1/join')) return jsonResponse(200, restoreBody);
      if (url.endsWith('/v1/snapshot'))
        return jsonResponse(200, snapshot({ players: [{ id: 'p-me', displayName: 'Sam Original', joinedAt: 1 }], myStats: remoteDoc({ totalWalksClosed: 120, totalTreatsEarnedLifetime: 5_000 }, [{ id: 'hundred-walks', unlockedAt: 9 }]) }));
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;

  it('adopts the stored player name, marks onboarding done, brings the dog and the stats back, and queues nothing', async () => {
    const repos = makeRepos();
    const calls: string[] = [];
    const engine = engineWithFetch(repos, mkFetch(calls));
    const result = await engine.join({ serverUrl: 'https://example.test', code: 'ABCDEFGH', playerName: 'typed name', deviceLabel: 'New phone' });

    expect(result).toEqual({ ok: true, restored: true });
    expect((await repos.settings.getSyncIdentity())?.playerName).toBe('Sam Original');
    expect(await repos.settings.getOnboardingDone()).toBe(true);
    expect((await repos.denEconomy.getState()).dogName).toBe('Rex');
    expect(await repos.stats.getState()).toMatchObject({ totalWalksClosed: 120, totalTreatsEarnedLifetime: 5_000 });
    expect((await repos.stats.getUnlockedAchievements()).map((a) => a.id)).toEqual(['hundred-walks']);
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 0 }); // no player.rename, no dog.update
    expect(calls.slice(0, 2)).toEqual(['/v1/join', '/v1/snapshot']);
    expect(calls.some((c) => c.includes('/me/stats'))).toBe(false); // nothing to send back: the server had everything
  });

  it('a normal join is unchanged: typed name kept, onboarding flag untouched', async () => {
    const repos = makeRepos();
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/v1/join')) return jsonResponse(200, { ...restoreBody, restored: undefined, playerName: undefined });
      return jsonResponse(200, snapshot({ players: [{ id: 'p-me', displayName: 'Typed', joinedAt: 1 }] }));
    }) as unknown as typeof fetch;
    const result = await engineWithFetch(repos, fetchImpl).join({ serverUrl: 'https://example.test', code: 'ABCDEFGH', playerName: 'Typed', deviceLabel: 'x' });
    expect(result).toEqual({ ok: true });
    expect((await repos.settings.getSyncIdentity())?.playerName).toBe('Typed');
    expect(await repos.settings.getOnboardingDone()).toBe(false);
  });
});

describe('achievement ids vs the server schema', () => {
  it('every id this app can unlock matches the server pattern (one bad id would 400 the whole upload)', () => {
    for (const id of Object.keys(ACHIEVEMENTS)) expect(id).toMatch(new RegExp(ACHIEVEMENT_ID_PATTERN));
  });
});
