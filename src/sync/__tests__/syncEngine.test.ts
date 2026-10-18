import { ApiError } from '../apiClient';
import { BACKOFF_BASE_MS, MAX_ATTEMPTS, backoffDelayMs, planFailure } from '../outbox';
import { apiDen, engineWithFetch, IDENTITY, jsonResponse, makeEngine, makeRepos, snapshot } from '../../test/syncHelpers';
import type { Walk } from '../../types';

const walk = (id: string): Walk => ({
  id,
  startTime: 1_000,
  locations: [{ latitude: 1, longitude: 2, timestamp: 1_000, accuracy: 5 }],
  closed: true,
  startSource: 'button',
});

const uploadOk = (den = apiDen({ rev: 2 })) => ({ walkId: 'x', duplicate: false, reward: {} as never, den, serverTime: 2_000, seq: 3 });
const emptyEvents = { events: [], cursor: 7, hasMore: false, serverTime: 2_000 };

async function joined() {
  const repos = makeRepos();
  await repos.settings.saveSyncIdentity(IDENTITY);
  // Pretend the first snapshot happened so the engine pulls events.
  await repos.sync.saveState({ cursor: 7, lastSyncAt: 1 });
  return repos;
}

describe('backoff policy', () => {
  it('doubles from 5 s up to 5 min, and dead-letters at the attempt cap or on a permanent error', () => {
    expect(backoffDelayMs(1)).toBe(BACKOFF_BASE_MS);
    expect(backoffDelayMs(2)).toBe(2 * BACKOFF_BASE_MS);
    expect(backoffDelayMs(20)).toBe(5 * 60_000);
    expect(planFailure(0, true, 100)).toEqual({ nextAttemptAt: 100 + BACKOFF_BASE_MS, deadAt: null });
    expect(planFailure(MAX_ATTEMPTS - 1, true, 100).deadAt).toBe(100);
    expect(planFailure(0, false, 100).deadAt).toBe(100);
  });
});

describe('player rename', () => {
  it('saves the trimmed name locally at once, sends player.rename, and ignores empty names', async () => {
    const repos = await joined();
    const command = jest.fn(async () => ({ clientId: 'c', ok: true, replayed: false, den: apiDen({ rev: 1 }), serverTime: 1, seq: 1 }));
    const engine = makeEngine(repos, { command, events: async () => emptyEvents });
    expect(await engine.renamePlayer('   ')).toBe(false);
    expect(await engine.renamePlayer('  Sam B.  ')).toBe(true);
    expect((await repos.settings.getSyncIdentity())?.playerName).toBe('Sam B.');
    expect((await engine.getStatus()).playerName).toBe('Sam B.');
    expect((await repos.sync.getState()).players['p-me']).toBe('Sam B.');
    await engine.syncNow();
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'player.rename', name: 'Sam B.' } }));
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 0 });
  });

  it('is a no-op when not joined', async () => {
    const engine = makeEngine(makeRepos(), {});
    expect(await engine.renamePlayer('Sam')).toBe(false);
  });

  it('adopts a rename done on another phone of the same player, unless one of ours is still queued', async () => {
    const repos = await joined();
    await repos.sync.saveState({ players: { 'p-me': 'Sam' } });
    const events = jest.fn(async () => ({
      events: [
        { seq: 8, kind: 'member.updated' as const, actorPlayerId: 'p-me', createdAt: 5, payload: { player: { id: 'p-me', displayName: 'Bas', joinedAt: 1 } } },
      ],
      cursor: 8,
      hasMore: false,
      serverTime: 2_000,
    }));
    await makeEngine(repos, { events }).syncNow();
    expect((await repos.settings.getSyncIdentity())?.playerName).toBe('Bas');
  });
});

describe('manual logs and walk deletes', () => {
  it('uploads a manual log with no locations and the refreshed route', async () => {
    const repos = await joined();
    const uploadWalk = jest.fn(async () => uploadOk());
    const engine = makeEngine(repos, { uploadWalk, events: async () => emptyEvents });
    const manual: Walk = { id: 'manual-1700000000001', startTime: 1_000, locations: [], closed: true, startSource: 'manual-log', refreshedRouteWalkId: 'route-1' };
    await repos.walks.saveWalk(manual);
    await engine.enqueueWalk(manual, null);
    await engine.syncNow();
    expect(uploadWalk).toHaveBeenCalledWith({
      id: 'manual-1700000000001',
      startTime: 1_000,
      startSource: 'manual-log',
      locations: [],
      refreshRouteWalkId: 'route-1',
    });
    expect((await repos.walks.getWalk(manual.id))?.syncedAt).not.toBeNull();
  });

  it('queues walk.delete for a History delete, only when joined', async () => {
    const repos = await joined();
    const command = jest.fn(async () => ({ clientId: 'c', ok: true, replayed: false, den: apiDen({ rev: 1 }), serverTime: 1, seq: 1 }));
    await makeEngine(repos, { command, events: async () => emptyEvents }).enqueueWalkDelete('w-del');
    await makeEngine(repos, { command, events: async () => emptyEvents }).syncNow();
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'walk.delete', walkId: 'w-del' } }));

    const unjoined = makeRepos();
    await makeEngine(unjoined, {}).enqueueWalkDelete('w-del');
    expect(await unjoined.sync.counts()).toEqual({ pending: 0, dead: 0 });
  });
});

describe('outbox retry', () => {
  it('keeps the walk queued with backoff when offline, then delivers it once the server is back', async () => {
    const repos = await joined();
    const clock = { now: 1_000_000 };
    let online = false;
    const uploadWalk = jest.fn(async () => {
      if (!online) throw new ApiError('network', 'down');
      return uploadOk();
    });
    const engine = makeEngine(repos, { uploadWalk, events: async () => emptyEvents }, clock);
    await repos.walks.saveWalk(walk('w1'));

    await engine.enqueueWalk(walk('w1'), 'Parkviertel');
    await engine.syncNow();
    expect(uploadWalk).toHaveBeenCalledTimes(1);
    expect(await repos.sync.counts()).toEqual({ pending: 1, dead: 0 });
    expect((await repos.sync.getPending())[0]).toMatchObject({ attempts: 1, nextAttemptAt: clock.now + BACKOFF_BASE_MS });

    // Inside the backoff window nothing is sent.
    await engine.syncNow();
    expect(uploadWalk).toHaveBeenCalledTimes(1);

    online = true;
    clock.now += BACKOFF_BASE_MS + 1;
    await engine.syncNow();
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 0 });
    expect((await repos.walks.getWalk('w1'))?.syncedAt).not.toBeNull();
    expect((await repos.denEconomy.getState()).bakeryLevel).toBe(2); // server den applied
  });

  it('sends the territory hint and the walk id as the idempotency key', async () => {
    const repos = await joined();
    const uploadWalk = jest.fn(async () => uploadOk());
    const engine = makeEngine(repos, { uploadWalk, events: async () => emptyEvents });
    await engine.enqueueWalk(walk('same'), 'Parkviertel');
    await engine.enqueueWalk(walk('same'), 'Parkviertel'); // duplicate enqueue is a no-op
    await engine.syncNow();
    expect(uploadWalk).toHaveBeenCalledTimes(1);
    expect(uploadWalk).toHaveBeenCalledWith(expect.objectContaining({ id: 'same', startSource: 'button', territoryNameHint: 'Parkviertel' }));
  });

  it('dead-letters after the attempt cap and stops blocking later items', async () => {
    const repos = await joined();
    const clock = { now: 1_000_000 };
    const command = jest.fn(async () => ({ clientId: 'c', ok: true, replayed: false, den: apiDen({ rev: 3 }), serverTime: 1, seq: 1 }));
    const uploadWalk = jest.fn(async () => {
      throw new ApiError('server', 'HTTP 500', 500);
    });
    const engine = makeEngine(repos, { uploadWalk, command, events: async () => emptyEvents }, clock);
    await engine.enqueueWalk(walk('bad'), null);
    await engine.enqueueCommand({ kind: 'den.upgrade', building: 'bakery' });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await engine.syncNow({ force: true });
      clock.now += 6 * 60_000;
    }
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 1 });
    expect(uploadWalk).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(command).toHaveBeenCalledTimes(1); // went through once the walk was dead-lettered
  });

  it('a permanent rejection (422) is dead-lettered at once and the rest still goes', async () => {
    const repos = await joined();
    const command = jest.fn(async () => ({ clientId: 'c', ok: true, replayed: false, den: apiDen({ rev: 3 }), serverTime: 1, seq: 1 }));
    const uploadWalk = jest.fn(async () => {
      throw new ApiError('client', 'HTTP 422', 422, 'walk_rejected:too-old');
    });
    const engine = makeEngine(repos, { uploadWalk, command, events: async () => emptyEvents });
    await engine.enqueueWalk(walk('old'), null);
    await engine.enqueueCommand({ kind: 'den.upgrade', building: 'bakery' });
    await engine.syncNow();
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 1 });
    expect(command).toHaveBeenCalledTimes(1);
  });

  it('applies only the last response den, and an ok:false command is silent (item done, server den wins)', async () => {
    const repos = await joined();
    await repos.denEconomy.saveState({ ...(await repos.denEconomy.getState()), treats: 1 });
    const command = jest.fn(async () => ({
      clientId: 'c',
      ok: false,
      error: 'insufficient-treats' as const,
      replayed: false,
      den: apiDen({ rev: 9, treats: 300 }),
      serverTime: 1,
      seq: 1,
    }));
    const engine = makeEngine(repos, { command, events: async () => emptyEvents });
    await engine.enqueueCommand({ kind: 'den.upgrade', building: 'bakery' });
    await engine.syncNow();
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 0 });
    expect((await repos.denEconomy.getState()).treats).toBe(300);
  });

  it('does not pull while the outbox is blocked (a stale server den must not undo local optimistic changes)', async () => {
    const repos = await joined();
    const events = jest.fn(async () => emptyEvents);
    const engine = makeEngine(repos, { command: async () => { throw new ApiError('timeout', 't'); }, events });
    await engine.enqueueCommand({ kind: 'den.upgrade', building: 'bakery' });
    await engine.syncNow();
    expect(events).not.toHaveBeenCalled();
  });

  it('a revoked token (401) keeps the outbox and flags the status without counting an attempt', async () => {
    const repos = await joined();
    const engine = makeEngine(repos, { uploadWalk: async () => { throw new ApiError('unauthorized', '401', 401); } });
    await engine.enqueueWalk(walk('w'), null);
    await engine.syncNow();
    expect((await engine.getStatus()).unauthorized).toBe(true);
    expect((await repos.sync.getPending())[0].attempts).toBe(0);
  });

  it('a 426 keeps the item queued (no attempt, not dead), sets needsUpdate, and a later accepted write clears it', async () => {
    const repos = await joined();
    let accept = false;
    const uploadWalk = jest.fn(async () => {
      if (!accept) throw new ApiError('upgrade-required', 'HTTP 426 upgrade_required', 426, 'upgrade_required');
      return uploadOk();
    });
    const events = jest.fn(async () => emptyEvents);
    const engine = makeEngine(repos, { uploadWalk, events });
    await repos.walks.saveWalk(walk('w'));
    await engine.enqueueWalk(walk('w'), null);
    await engine.syncNow({ force: true });
    expect((await engine.getStatus()).needsUpdate).toBe(true);
    expect(await repos.sync.counts()).toEqual({ pending: 1, dead: 0 });
    expect((await repos.sync.getPending())[0].attempts).toBe(0);
    expect(events).not.toHaveBeenCalled();
    accept = true; // e.g. the app was updated
    await engine.syncNow({ force: true });
    expect((await engine.getStatus()).needsUpdate).toBe(false);
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 0 });
  });

  it('reads keep working while needsUpdate is set and the outbox is empty', async () => {
    const repos = await joined();
    await repos.sync.saveState({ needsUpdate: true });
    const events = jest.fn(async () => emptyEvents);
    await makeEngine(repos, { events }).syncNow();
    expect(events).toHaveBeenCalled();
  });

  it('does nothing and queues nothing when not joined', async () => {
    const repos = makeRepos();
    const uploadWalk = jest.fn();
    const engine = makeEngine(repos, { uploadWalk });
    await engine.enqueueWalk(walk('w'), null);
    await engine.syncNow();
    expect(uploadWalk).not.toHaveBeenCalled();
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 0 });
  });
});

describe('pull', () => {
  it('uses the snapshot on the first sync, then events after the cursor', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const snapshotFn = jest.fn(async () => snapshot({ seq: 7 }));
    const events = jest.fn(async () => emptyEvents);
    const engine = makeEngine(repos, { snapshot: snapshotFn, events });
    await engine.syncNow();
    expect(snapshotFn).toHaveBeenCalledTimes(1);
    await engine.syncNow();
    expect(events).toHaveBeenCalledWith(7);
    expect((await engine.getStatus()).lastSyncAt).not.toBeNull();
  });

  it('falls back to a snapshot when the cursor is too old (410)', async () => {
    const repos = await joined();
    const snapshotFn = jest.fn(async () => snapshot({ seq: 50 }));
    const engine = makeEngine(repos, { snapshot: snapshotFn, events: async () => { throw new ApiError('client', 'gone', 410); } });
    await engine.syncNow();
    expect(snapshotFn).toHaveBeenCalled();
    expect((await repos.sync.getState()).cursor).toBe(50);
  });

  it('pages through hasMore and reports Den/range changes to the callbacks', async () => {
    const repos = await joined();
    const pages = [
      { events: [{ seq: 8, kind: 'den.updated' as const, actorPlayerId: 'p-lisa', createdAt: 1, payload: { den: apiDen({ rev: 5, treats: 42 }) } }], cursor: 8, hasMore: true, serverTime: 1 },
      { events: [{ seq: 9, kind: 'cells.changed' as const, actorPlayerId: 'p-lisa', createdAt: 1, payload: { cells: [{ ix: 1, iy: 1, visits: 1, lastTracked: 1, lastRefreshed: 1, territoryId: null }], reassigned: [] } }], cursor: 9, hasMore: false, serverTime: 1 },
    ];
    const events = jest.fn(async () => pages.shift()!);
    const engine = makeEngine(repos, { events });
    const onDenChanged = jest.fn();
    const onRangeChanged = jest.fn();
    engine.setCallbacks({ onDenChanged, onRangeChanged });
    await engine.syncNow();
    expect(events).toHaveBeenNthCalledWith(1, 7);
    expect(events).toHaveBeenNthCalledWith(2, 8);
    expect(onDenChanged).toHaveBeenCalledWith(expect.objectContaining({ treats: 42 }));
    expect(onRangeChanged).toHaveBeenCalled();
    expect((await repos.sync.getState()).cursor).toBe(9);
  });

  it('hands the partner walks it just fetched to onPartnerWalks (the mini homecoming matches them to a presence that ended)', async () => {
    const repos = await joined();
    const added = {
      seq: 8,
      kind: 'walk.added' as const,
      actorPlayerId: 'p-lisa',
      createdAt: 1,
      payload: {
        walk: { id: 'wl', playerId: 'p-lisa', startTime: 500, startSource: 'button' as const, closed: true, newGroundCellIds: [], treatsEarned: 9, deleted: false },
        cellsPainted: 0,
      },
    };
    const getWalk = jest.fn(async (id: string) => ({ ...added.payload.walk, id, locations: [{ latitude: 1, longitude: 2, timestamp: 500, accuracy: 5 }] }));
    const engine = makeEngine(repos, { events: async () => ({ events: [added], cursor: 8, hasMore: false, serverTime: 1 }), getWalk });
    const onPartnerWalks = jest.fn();
    engine.setCallbacks({ onPartnerWalks });
    await engine.syncNow();
    expect(onPartnerWalks).toHaveBeenCalledWith([expect.objectContaining({ walkId: 'wl', playerId: 'p-lisa', treatsEarned: 9 })]);
  });
});

describe('join flow (mock fetch)', () => {
  const joinBody = { token: 'secret', householdId: 'h1', householdName: 'Haus', playerId: 'p-me', deviceId: 'd1', serverTime: 1, seq: 7 };

  it('joins, stores the identity, then loads the snapshot with the bearer token', async () => {
    const repos = makeRepos();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/v1/join')) return jsonResponse(200, joinBody);
      if (url.endsWith('/v1/snapshot')) return jsonResponse(200, snapshot());
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
    const engine = engineWithFetch(repos, fetchImpl);

    const result = await engine.join({ serverUrl: 'https://example.test/', code: 'abcd-efgh', playerName: ' Sam ', deviceLabel: 'Pixel' });

    expect(result).toEqual({ ok: true });
    expect(calls[0].url).toBe('https://example.test/v1/join');
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ code: 'ABCDEFGH', playerName: 'Sam', deviceLabel: 'Pixel', consent: true });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(calls[1].url).toBe('https://example.test/v1/snapshot');
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(await repos.settings.getSyncIdentity()).toEqual({
      serverUrl: 'https://example.test',
      token: 'secret',
      householdId: 'h1',
      playerId: 'p-me',
      deviceId: 'd1',
      playerName: 'Sam',
      householdName: 'Haus',
    });
    expect((await repos.denEconomy.getState()).dogName).toBe('Rex');
    expect((await engine.getStatus()).joined).toBe(true);
  });

  it('maps failures to gentle reasons and stores nothing', async () => {
    const mk = (status: number | 'throw') =>
      (async () => {
        if (status === 'throw') throw new TypeError('Network request failed');
        return jsonResponse(status, { error: 'invalid_invite' });
      }) as unknown as typeof fetch;
    const input = { serverUrl: 'https://example.test', code: 'ABCDEFGH', playerName: 'B', deviceLabel: 'x' };
    for (const [status, reason] of [[403, 'invalid-code'], ['throw', 'network'], [503, 'server']] as const) {
      const repos = makeRepos();
      expect(await engineWithFetch(repos, mk(status)).join(input)).toEqual({ ok: false, reason });
      expect(await repos.settings.getSyncIdentity()).toBeNull();
    }
    const repos = makeRepos();
    const engine = engineWithFetch(repos, mk(200));
    expect(await engine.join({ ...input, code: 'SHORT' })).toEqual({ ok: false, reason: 'invalid-input' });
    expect(await engine.join({ ...input, serverUrl: 'ftp://x' })).toEqual({ ok: false, reason: 'invalid-input' });
    expect(await engine.join({ ...input, playerName: '  ' })).toEqual({ ok: false, reason: 'invalid-input' });
  });

  it('leave clears the token and outbox but keeps local game data', async () => {
    const repos = await joined();
    await repos.walks.saveWalk(walk('keep'));
    const engine = makeEngine(repos, {});
    await engine.enqueueWalk(walk('keep'), null);
    await engine.leave();
    expect(await repos.settings.getSyncIdentity()).toBeNull();
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 0 });
    expect(await repos.walks.getWalk('keep')).not.toBeNull();
    expect((await engine.getStatus()).joined).toBe(false);
  });
});
