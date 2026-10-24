// The household's shared dog look: a newer rev replaces ours, our own unsent change wins, the first phone seeds a household without one.
import { FUR_ZONES, defaultBuddyAppearance, type BuddyAppearance } from '../../buddy/buddyAppearance';
import { createInMemoryBuddyAppearanceRepository } from '../../storage/inMemoryBuddyAppearanceRepository';
import { apiDen, IDENTITY, makeEngine, makeRepos, snapshot } from '../../test/syncHelpers';
import { ApiError } from '../apiClient';
import type { ApiEvent, CommandBody } from '../apiContract';

const golden = defaultBuddyAppearance();
const ginger: BuddyAppearance = { ...golden, coat: 'ginger', earStyle: 'pointy' };
const fur: BuddyAppearance = {
  ...golden,
  fur: { zones: Object.fromEntries(FUR_ZONES.map((z) => [z, '#C8A27A'])) as never, muzzle: 'long', furLength: 'fluffy' },
};

const stored = { coat: 'charcoal', size: 'medium', earStyle: 'pointy', markings: 'none', tailStyle: 'curly', accentColour: 'cream' };
const withLook = (appearance: Record<string, unknown>, appearanceRev: number) =>
  snapshot({ dog: { id: 'dog1', name: 'Newt', appearance, appearanceRev, updatedAt: 1 } });

const emptyEvents = { events: [], cursor: 7, hasMore: false, serverTime: 2_000 };
const commandOk = () => jest.fn(async (_req?: unknown) => ({ clientId: 'c', ok: true, replayed: false, den: apiDen({ rev: 1 }), serverTime: 1, seq: 1 }));
const lookEvent = (seq: number, appearance: BuddyAppearance, rev: number): ApiEvent =>
  ({ seq, kind: 'dog.appearance', actorPlayerId: 'p-lisa', createdAt: 5, payload: { appearance: appearance as never, rev } }) as ApiEvent;

async function phone(opts: { synced?: boolean; look?: BuddyAppearance } = {}) {
  const repos = makeRepos();
  const buddyAppearance = createInMemoryBuddyAppearanceRepository();
  if (opts.look) await buddyAppearance.saveAppearance(opts.look);
  await repos.settings.saveSyncIdentity(IDENTITY);
  await repos.sync.saveState({ cursor: 7, lastSyncAt: 1, territoriesReconciled: true, appearanceSynced: opts.synced ?? true });
  return { repos, buddyAppearance, all: { ...repos, buddyAppearance } };
}

describe('shared dog look', () => {
  it('replaces the local look when the partner changes it, and reports it once', async () => {
    const p = await phone({ look: golden });
    const onAppearanceChanged = jest.fn();
    const events = jest.fn(async () => ({ ...emptyEvents, events: [lookEvent(8, fur, 3)], cursor: 8 }));
    const engine = makeEngine(p.all as never, { events });
    engine.setCallbacks({ onAppearanceChanged });
    await engine.syncNow();
    expect((await p.buddyAppearance.getAppearance()).fur?.furLength).toBe('fluffy');
    expect(onAppearanceChanged).toHaveBeenCalledTimes(1);
    expect((await p.repos.sync.getState()).appearanceRev).toBe(3);

    // The same or an older rev later changes nothing.
    events.mockResolvedValueOnce({ ...emptyEvents, events: [lookEvent(9, ginger, 2)], cursor: 9 });
    await engine.syncNow({ force: true });
    expect((await p.buddyAppearance.getAppearance()).coat).toBe('golden');
    expect(onAppearanceChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps a local change that is still unsent, then converges after the push', async () => {
    const p = await phone({ look: golden });
    const command = commandOk();
    let pushNow = false;
    const events = jest.fn(async () => ({ ...emptyEvents, events: [lookEvent(8, fur, 3)], cursor: 8 }));
    const engine = makeEngine(p.all as never, {
      events,
      command: async () => {
        if (!pushNow) throw new ApiError('network', 'offline');
        return command(undefined);
      },
    } as never);
    await p.buddyAppearance.saveAppearance(ginger);
    await engine.enqueueAppearance(ginger);
    await engine.syncNow({ force: true });
    expect((await p.buddyAppearance.getAppearance()).coat).toBe('ginger'); // push failed, so the partner's older look did not win
    expect((await p.repos.sync.getPending()).map((i) => (i.payload as CommandBody).kind)).toEqual(['appearance.set']);
    pushNow = true;
    await engine.syncNow({ force: true });
    expect(command).toHaveBeenCalledTimes(1);
    expect(await p.repos.sync.counts()).toEqual({ pending: 0, dead: 0 });
    expect((await p.buddyAppearance.getAppearance()).coat).toBe('golden'); // the household's newer rev (fur look) now applies
  });

  it('offers a chosen look to a household nobody claimed yet (ifUnset, first wins), and adopts it back from the server', async () => {
    const chosen = await phone({ synced: false, look: ginger });
    const command = commandOk();
    const engine = makeEngine(chosen.all as never, { snapshot: async () => withLook(stored, 0), command, events: async () => emptyEvents } as never);
    await engine.syncNow({ force: true }); // the seed is queued after the pull ...
    await engine.syncNow({ force: true }); // ... and goes up with the next push
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'appearance.set', appearance: expect.objectContaining({ coat: 'ginger' }), ifUnset: true } }));
    expect((await chosen.repos.sync.getState()).appearanceSynced).toBe(true);
    expect((await chosen.buddyAppearance.getAppearance()).coat).toBe('ginger'); // its own look is not replaced by the import's
  });

  it('a phone on the default look (never chose, or skipped) never overwrites a stored look: it adopts it', async () => {
    for (const look of [undefined, golden]) {
      const p = await phone({ synced: false, look });
      const command = commandOk();
      const onAppearanceChanged = jest.fn();
      const engine = makeEngine(p.all as never, { snapshot: async () => withLook(stored, 0), command, events: async () => emptyEvents } as never);
      engine.setCallbacks({ onAppearanceChanged });
      await engine.syncNow({ force: true });
      await engine.syncNow({ force: true });
      expect(command).not.toHaveBeenCalled();
      expect((await p.buddyAppearance.getAppearance()).coat).toBe('charcoal');
      expect(onAppearanceChanged).toHaveBeenCalledTimes(1);
    }
  });

  it('adopts a claimed household look (rev above 0) from a snapshot', async () => {
    const p = await phone({ synced: false, look: ginger });
    const command = commandOk();
    const engine = makeEngine(p.all as never, { snapshot: async () => withLook(fur as never, 4), command, events: async () => emptyEvents } as never);
    await engine.syncNow({ force: true });
    expect((await p.buddyAppearance.getAppearance()).fur?.muzzle).toBe('long');
    expect((await p.repos.sync.getState()).appearanceRev).toBe(4);
    expect(command).not.toHaveBeenCalled();
  });

  it('does nothing when not joined, and an old server (no field) neither seeds nor marks the phone synced', async () => {
    const repos = makeRepos();
    const engine = makeEngine({ ...repos, buddyAppearance: createInMemoryBuddyAppearanceRepository() } as never, {});
    await engine.enqueueAppearance(ginger);
    expect(await repos.sync.counts()).toEqual({ pending: 0, dead: 0 });

    const p = await phone({ synced: false, look: ginger });
    const command = commandOk();
    await makeEngine(p.all as never, { snapshot: async () => snapshot(), command, events: async () => emptyEvents } as never).syncNow({ force: true });
    expect(command).not.toHaveBeenCalled();
    expect((await p.repos.sync.getState()).appearanceSynced).not.toBe(true);
  });

  it('a dropped or dead-lettered own look change re-adopts the household look from one fresh snapshot', async () => {
    const p = await phone({ look: golden });
    await p.repos.sync.saveState({ appearanceRev: 3 });
    const snap = jest.fn(async () => withLook(fur as never, 3));
    const command = jest.fn(async () => {
      throw new ApiError('client', 'bad', 422, 'unprocessable'); // permanent: dead-lettered
    });
    const engine = makeEngine(p.all as never, { command, snapshot: snap, events: async () => emptyEvents } as never);
    await p.buddyAppearance.saveAppearance(ginger);
    await engine.enqueueAppearance(ginger);
    await engine.syncNow({ force: true });
    await engine.syncNow({ force: true });
    expect(snap).toHaveBeenCalledTimes(1);
    expect((await p.buddyAppearance.getAppearance()).fur?.furLength).toBe('fluffy');
    expect((await p.repos.sync.getState()).appearanceSynced).toBe(true);
  });

  it('drops appearance.set quietly when an older server answers 400', async () => {
    const p = await phone({ look: golden });
    const command = jest.fn(async () => {
      throw new ApiError('client', 'bad', 400, 'bad_request');
    });
    const engine = makeEngine(p.all as never, { command, events: async () => emptyEvents } as never);
    await engine.enqueueAppearance(ginger);
    await engine.syncNow({ force: true });
    expect(await p.repos.sync.counts()).toEqual({ pending: 0, dead: 0 });
  });
});
