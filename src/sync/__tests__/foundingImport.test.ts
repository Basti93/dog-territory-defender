import { ApiError } from '../apiClient';
import { apiDen, IDENTITY, makeEngine, makeRepos, snapshot, defaultDenEconomyState } from '../../test/syncHelpers';

const emptySnap = () => snapshot({ walks: [], den: apiDen({ rev: 0 }) });

async function withProgress() {
  const repos = makeRepos();
  await repos.settings.saveSyncIdentity(IDENTITY);
  await repos.walks.saveWalk({ id: 'old', startTime: 5, locations: [], closed: true, startSource: 'button', treatsEarned: 3 });
  await repos.homeRange.replaceAll([{ ix: 1, iy: 1, visits: 2, lastTracked: 5, lastRefreshed: 5, territoryId: 't' }], null);
  await repos.denEconomy.saveState({ ...defaultDenEconomyState(0), level: 4, treats: 321, dogName: 'Rex' });
  return repos;
}

describe('founding import', () => {
  it('imports local progress once when the household is empty, and uses the import snapshot', async () => {
    const repos = await withProgress();
    const importHousehold = jest.fn(async (_req: unknown) => ({ ...snapshot({ den: apiDen({ rev: 1, treats: 321 }) }), replayed: false }));
    const engine = makeEngine(repos, { snapshot: async () => emptySnap(), importHousehold, events: async () => ({ events: [], cursor: 7, hasMore: false, serverTime: 1 }) });
    await engine.syncNow();
    await engine.syncNow();
    expect(importHousehold).toHaveBeenCalledTimes(1);
    const req = importHousehold.mock.calls[0][0] as { walks: unknown[]; cells: unknown[]; den: { treats: number }; dog: { name: string } };
    expect(req.walks).toHaveLength(1);
    expect(req.cells).toHaveLength(1);
    expect(req.den.treats).toBe(321);
    expect(req.dog.name).toBe('Rex');
    expect((await repos.denEconomy.getState()).treats).toBe(321);
  });

  it('retries with the same importId after a failure', async () => {
    const repos = await withProgress();
    let fail = true;
    const importHousehold = jest.fn(async (_req: unknown) => {
      if (fail) throw new ApiError('network', 'down');
      return { ...snapshot(), replayed: true };
    });
    const engine = makeEngine(repos, { snapshot: async () => emptySnap(), importHousehold });
    await engine.syncNow();
    fail = false;
    await engine.syncNow();
    expect(importHousehold).toHaveBeenCalledTimes(2);
    const ids = importHousehold.mock.calls.map((c) => (c[0] as { importId: string }).importId);
    expect(ids[0]).toBe(ids[1]);
    expect((await repos.sync.getState()).importId).toBe(ids[0]);
  });

  it('skips silently on 409 and applies the plain snapshot', async () => {
    const repos = await withProgress();
    const importHousehold = jest.fn(async () => {
      throw new ApiError('client', 'HTTP 409', 409, 'import_not_allowed');
    });
    const engine = makeEngine(repos, { snapshot: async () => emptySnap(), importHousehold });
    await engine.syncNow();
    expect((await engine.getStatus()).lastSyncAt).not.toBeNull();
    expect((await repos.sync.getState()).cursor).toBe(7);
  });

  it('does not import into a household that already has walks, or without local progress', async () => {
    const full = await withProgress();
    const imp1 = jest.fn();
    await makeEngine(full, { snapshot: async () => snapshot({ walks: [{ id: 'x' } as never] }), importHousehold: imp1 }).syncNow().catch(() => {});
    expect(imp1).not.toHaveBeenCalled();

    const fresh = makeRepos();
    await fresh.settings.saveSyncIdentity(IDENTITY);
    const imp2 = jest.fn();
    await makeEngine(fresh, { snapshot: async () => emptySnap(), importHousehold: imp2 }).syncNow();
    expect(imp2).not.toHaveBeenCalled();
  });

  it('reports ok:false command answers through onCommandRejected', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    await repos.sync.saveState({ cursor: 7, lastSyncAt: 1, territoriesReconciled: true });
    const command = async () => ({ clientId: 'c', ok: false, error: 'insufficient-treats' as const, replayed: false, den: apiDen({ rev: 2 }), serverTime: 1, seq: 1 });
    const engine = makeEngine(repos, { command, events: async () => ({ events: [], cursor: 7, hasMore: false, serverTime: 1 }) });
    const onCommandRejected = jest.fn();
    engine.setCallbacks({ onCommandRejected });
    await engine.enqueueCommand({ kind: 'den.upgrade', building: 'bakery' });
    await engine.syncNow();
    expect(onCommandRejected).toHaveBeenCalledWith('insufficient-treats');
  });

  it('a territory.name the server cannot place (not-found, or an old server answering 400) is dropped quietly: no rejection callback, no dead letter', async () => {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    await repos.sync.saveState({ cursor: 7, lastSyncAt: 1, territoriesReconciled: true });
    let n = 0;
    const command = async () => {
      if (n++ === 0) return { clientId: 'c', ok: false, error: 'not-found' as const, replayed: false, den: apiDen({ rev: 2 }), serverTime: 1, seq: 1 };
      throw new ApiError('client', 'HTTP 400', 400, 'bad_request');
    };
    const engine = makeEngine(repos, { command, events: async () => ({ events: [], cursor: 7, hasMore: false, serverTime: 1 }) });
    const onCommandRejected = jest.fn();
    engine.setCallbacks({ onCommandRejected });
    await engine.enqueueCommand({ kind: 'territory.name', fromWalkId: 'walk-0001', name: 'Aue' });
    await engine.syncNow();
    await engine.enqueueCommand({ kind: 'territory.name', fromWalkId: 'walk-0002', name: 'Aue' });
    await engine.syncNow();
    expect(onCommandRejected).not.toHaveBeenCalled();
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 0 });
  });
});
