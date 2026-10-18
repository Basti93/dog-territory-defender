import { applyEvents, applyNearby, applySnapshot } from '../apply';
import { getNearby } from '../nearbyStore';
import type { ApiEvent, ApiWalkFull } from '../apiContract';
import { apiDen, IDENTITY, makeRepos, snapshot, defaultDenEconomyState } from '../../test/syncHelpers';

function fullWalk(id: string, playerId = 'p-lisa'): ApiWalkFull {
  return {
    id,
    playerId,
    startTime: 500,
    startSource: 'button',
    closed: true,
    newGroundCellIds: [],
    treatsEarned: 12,
    deleted: false,
    locations: [{ latitude: 1, longitude: 2, timestamp: 500, accuracy: 5 }],
  };
}

function ctx(fetched: string[] = []) {
  return {
    playerId: IDENTITY.playerId,
    now: 9_000,
    fetchWalk: async (id: string) => {
      fetched.push(id);
      return fullWalk(id);
    },
  };
}

const cell = (ix: number, iy: number, visits: number, lastTracked: number, territoryId: string | null = null) => ({
  ix,
  iy,
  visits,
  lastTracked,
  lastRefreshed: lastTracked,
  territoryId,
});

describe('cell merge rules', () => {
  it('keeps max(visits) and max(lastTracked/lastRefreshed) per cell and takes territoryId from the server', async () => {
    const repos = makeRepos();
    await repos.homeRange.replaceAll([cell(0, 0, 5, 100, 'old'), cell(1, 1, 1, 900, 'old')], null);
    await applySnapshot(
      snapshot({ cells: [cell(0, 0, 2, 800, 'srv'), cell(1, 1, 4, 100, 'srv'), cell(2, 2, 1, 50, 'srv')] }),
      repos,
      ctx()
    );
    const byKey = new Map((await repos.homeRange.getCells()).map((c) => [`${c.ix},${c.iy}`, c]));
    expect(byKey.get('0,0')).toMatchObject({ visits: 5, lastTracked: 800, lastRefreshed: 800, territoryId: 'srv' });
    expect(byKey.get('1,1')).toMatchObject({ visits: 4, lastTracked: 900, territoryId: 'srv' });
    expect(byKey.get('2,2')).toMatchObject({ visits: 1, lastTracked: 50, territoryId: 'srv' });
  });

  it('is idempotent and order-independent across replays', async () => {
    const a = makeRepos();
    const b = makeRepos();
    const events: ApiEvent[] = [1, 2].map((n) => ({
      seq: n,
      kind: 'cells.changed' as const,
      actorPlayerId: 'p-lisa',
      createdAt: n,
      payload: { cells: [cell(0, 0, n, n * 100, 't')], reassigned: [] },
    }));
    await applyEvents(events, 2, a, ctx());
    await applyEvents(events, 2, a, ctx());
    await applyEvents([...events].reverse(), 2, b, ctx());
    expect(await a.homeRange.getCells()).toEqual(await b.homeRange.getCells());
    expect((await a.homeRange.getCells())[0]).toMatchObject({ visits: 2, lastTracked: 200 });
  });

  it('a partner walk today counts as today for the once-per-day visit cap on this phone', async () => {
    const repos = makeRepos();
    const now = Date.now();
    await applySnapshot(snapshot({ cells: [cell(3, 3, 1, now, 't')] }), repos, ctx());
    await repos.homeRange.paintCells([{ ix: 3, iy: 3, refreshedAt: now, tracked: true }]);
    expect((await repos.homeRange.getCells())[0].visits).toBe(1);
  });
});

describe('territories', () => {
  it('upserts server territories (name server wins, counters max) and removes merged ones', async () => {
    const repos = makeRepos();
    await repos.territories.replaceAll([
      { id: 't-a', name: 'Local', createdAt: 1, walksHere: 5, treatsEarnedHere: 50 },
      { id: 't-b', name: 'Gone', createdAt: 2, walksHere: 1, treatsEarnedHere: 1 },
    ]);
    await applyEvents(
      [
        {
          seq: 1,
          kind: 'territory.changed',
          actorPlayerId: null,
          createdAt: 1,
          payload: { upserted: [{ id: 't-a', name: 'Server', createdAt: 1, walksHere: 3, treatsEarnedHere: 80 }], removedIds: ['t-b'] },
        },
      ],
      1,
      repos,
      ctx()
    );
    expect(await repos.territories.getTerritories()).toEqual([{ id: 't-a', name: 'Server', createdAt: 1, walksHere: 5, treatsEarnedHere: 80 }]);
  });

  it('reassigned cells follow the server merge', async () => {
    const repos = makeRepos();
    await repos.homeRange.replaceAll([cell(0, 0, 1, 1, 'loser')], null);
    await applyEvents(
      [{ seq: 1, kind: 'cells.changed', actorPlayerId: null, createdAt: 1, payload: { cells: [], reassigned: [{ from: 'loser', to: 'winner' }] } }],
      1,
      repos,
      ctx()
    );
    expect((await repos.homeRange.getCells())[0].territoryId).toBe('winner');
  });
});

describe('walks', () => {
  it('inserts missing walks (fetching the route once), never duplicates, and records who walked', async () => {
    const repos = makeRepos();
    const fetched: string[] = [];
    const snap = snapshot({ walks: [{ ...fullWalk('w1'), locations: undefined } as never] });
    await applySnapshot(snap, repos, ctx(fetched));
    await applySnapshot(snap, repos, ctx(fetched));
    expect(fetched).toEqual(['w1']);
    const walk = await repos.walks.getWalk('w1');
    expect(walk).toMatchObject({ playerId: 'p-lisa', playerName: 'Lisa', syncedAt: 9_000, treatsEarned: 12 });
    expect(walk?.locations).toHaveLength(1);
  });

  it('does not re-fetch my own walk that exists locally, only marks it synced', async () => {
    const repos = makeRepos();
    await repos.walks.saveWalk({ id: 'mine', startTime: 1, locations: [], closed: true, startSource: 'button' });
    const fetched: string[] = [];
    await applySnapshot(snapshot({ walks: [{ ...fullWalk('mine', 'p-me'), locations: undefined } as never] }), repos, ctx(fetched));
    expect(fetched).toEqual([]);
    expect((await repos.walks.getWalk('mine'))?.syncedAt).toBe(9_000);
  });

  it('walk.deleted removes the local copy', async () => {
    const repos = makeRepos();
    await repos.walks.saveWalk({ id: 'w9', startTime: 1, locations: [], closed: true, startSource: 'button' });
    await applyEvents(
      [{ seq: 1, kind: 'walk.deleted', actorPlayerId: 'p-lisa', createdAt: 1, payload: { walkId: 'w9' } }],
      1,
      repos,
      ctx()
    );
    expect(await repos.walks.getWalk('w9')).toBeNull();
  });
});

describe('den state', () => {
  it('server wins for server-owned fields, per-device flags survive, and older revisions are ignored', async () => {
    const repos = makeRepos();
    await repos.denEconomy.saveState({
      ...defaultDenEconomyState(0),
      treats: 5,
      homeRangeBackfillComplete: true,
      manualLogCountToday: 2,
      cliffhangerShownForLevel: 9,
    });
    const first = await applySnapshot(snapshot({ den: apiDen({ rev: 4, treats: 77 }) }), repos, ctx());
    expect(first.denState?.treats).toBe(77);
    const state = await repos.denEconomy.getState();
    expect(state).toMatchObject({ treats: 77, bakeryLevel: 2, level: 3, homeRangeBackfillComplete: true, manualLogCountToday: 2, cliffhangerShownForLevel: 9 });

    const stale = await applyEvents(
      [{ seq: 8, kind: 'den.updated', actorPlayerId: 'p-lisa', createdAt: 1, payload: { den: apiDen({ rev: 3, treats: 1 }) } }],
      8,
      repos,
      ctx()
    );
    expect(stale.denState).toBeNull();
    expect((await repos.denEconomy.getState()).treats).toBe(77);

    const fresh = await applyEvents(
      [{ seq: 9, kind: 'den.updated', actorPlayerId: 'p-lisa', createdAt: 1, payload: { den: apiDen({ rev: 5, treats: 40 }) } }],
      9,
      repos,
      ctx()
    );
    expect(fresh.denState?.treats).toBe(40);
  });

  it('adopts the server dog name and advances the cursor', async () => {
    const repos = makeRepos();
    await applySnapshot(snapshot({ seq: 7 }), repos, ctx());
    expect((await repos.denEconomy.getState()).dogName).toBe('Rex');
    expect((await repos.sync.getState()).cursor).toBe(7);
    await applyEvents([], 12, repos, ctx());
    expect((await repos.sync.getState()).cursor).toBe(12);
  });
});

describe('member.joined', () => {
  it('remembers a partner joining but not myself', async () => {
    const repos = makeRepos();
    const joined = (id: string, name: string, seq: number): ApiEvent => ({
      seq,
      kind: 'member.joined',
      actorPlayerId: id,
      createdAt: 77,
      payload: { player: { id, displayName: name, joinedAt: 77 } },
    });
    await applyEvents([joined('p-me', 'Sam', 1)], 1, repos, ctx());
    expect((await repos.sync.getState()).lastMemberJoined).toBeNull();
    await applyEvents([joined('p-lisa', 'Lisa', 2)], 2, repos, ctx());
    expect((await repos.sync.getState()).lastMemberJoined).toEqual({ playerName: 'Lisa', at: 77, playerId: 'p-lisa' });
  });
});

describe('member.updated', () => {
  it('replaces the partner name in sync state, last event wins, idempotent on replay', async () => {
    const repos = makeRepos();
    await applySnapshot(snapshot(), repos, ctx());
    const renamed = (name: string, seq: number): ApiEvent => ({
      seq,
      kind: 'member.updated',
      actorPlayerId: 'p-lisa',
      createdAt: 90,
      payload: { player: { id: 'p-lisa', displayName: name, joinedAt: 2 } },
    });
    await applyEvents([renamed('Lisa K.', 8), renamed('Lisi', 9)], 9, repos, ctx());
    await applyEvents([renamed('Lisa K.', 8), renamed('Lisi', 9)], 9, repos, ctx());
    const state = await repos.sync.getState();
    expect(state.players).toEqual({ 'p-me': 'Sam', 'p-lisa': 'Lisi' });
    expect(state.lastMemberJoined).toBeNull(); // a rename is not "joined"
  });
});

describe('neighbour events (Track B)', () => {
  const ev = (seq: number, kind: 'neighbour.sniffed' | 'neighbour.gift', line: string, at: number): ApiEvent =>
    ({
      seq,
      kind,
      actorPlayerId: null,
      createdAt: at,
      payload: { botName: 'Momo', botId: 'b1', line, params: { bot: 'Momo' } },
    }) as ApiEvent;

  it('keeps the newest lines (idempotent on replay), flags the batch, and does not touch the Range', async () => {
    const repos = makeRepos();
    const events = [ev(1, 'neighbour.sniffed', 'neighbours.line.sniffCorner', 100), ev(2, 'neighbour.gift', 'neighbours.line.stickLeft', 200)];
    const result = await applyEvents(events, 2, repos, ctx());
    expect(result.neighbourEvents).toBe(true);
    expect(result.rangeChanged).toBe(false);
    await applyEvents(events, 2, repos, ctx());
    const lines = (await repos.sync.getState()).neighbourLines!;
    expect(lines.map((l) => l.seq)).toEqual([2, 1]);
    expect(lines[0]).toMatchObject({ line: 'neighbours.line.stickLeft', botName: 'Momo', at: 200 });
  });

  it('applyNearby stores the bot ranges in memory', () => {
    applyNearby({ items: [{ id: 'b1', kind: 'bot', generated: true, archetype: 'momo', dogName: 'Momo', appearance: {}, traitKey: 'k', areaLabel: 'near', lastActiveBucket: 'today', metCount: 1, rangeCells: [{ ix: 1, iy: 2 }] }] });
    expect(getNearby()[0].rangeCells).toEqual([{ ix: 1, iy: 2 }]);
  });
});

describe('unknown event kinds (a newer server)', () => {
  it('skips them without throwing, still applies the known events around them, and moves the cursor past them', async () => {
    const repos = makeRepos();
    const events = [
      { seq: 5, kind: 'dog.updated', actorPlayerId: null, createdAt: 1, payload: { dog: { id: 'd', name: 'Rex', appearance: {}, updatedAt: 1 } } },
      { seq: 6, kind: 'postcard.stamped', actorPlayerId: 'p-lisa', createdAt: 2, payload: { walkId: 'w1', stampKey: 'nice' } },
      { seq: 7, kind: 'member.updated', actorPlayerId: 'p-lisa', createdAt: 3, payload: { player: { id: 'p-lisa', displayName: 'Lisa B.', joinedAt: 1 } } },
    ] as unknown as ApiEvent[];
    await expect(applyEvents(events, 7, repos, ctx())).resolves.toMatchObject({ walksAdded: 0, rangeChanged: false, neighbourEvents: false });
    const state = await repos.sync.getState();
    expect(state.cursor).toBe(7);
    expect(state.players['p-lisa']).toBe('Lisa B.');
    expect((await repos.denEconomy.getState()).dogName).toBe('Rex');
  });

  it('advances the cursor even when the whole batch is unknown', async () => {
    const repos = makeRepos();
    await repos.sync.saveState({ cursor: 3 });
    const events = [{ seq: 4, kind: 'future.thing', actorPlayerId: null, createdAt: 1, payload: {} }] as unknown as ApiEvent[];
    await applyEvents(events, 4, repos, ctx());
    expect((await repos.sync.getState()).cursor).toBe(4);
  });
});
