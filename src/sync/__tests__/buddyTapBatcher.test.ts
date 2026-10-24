import { createBuddyTapBatcher } from '../buddyTapBatcher';
import { apiDen, IDENTITY, makeEngine, makeRepos } from '../../test/syncHelpers';
import { ApiError } from '../apiClient';
import type { CommandBody } from '../apiContract';

describe('buddy tap batcher', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('persists every tap at once and kicks one sync after the interval', () => {
    const persist = jest.fn(async () => undefined);
    const kick = jest.fn();
    const batcher = createBuddyTapBatcher(persist, kick, 30_000);
    batcher.add(1);
    batcher.add(3);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(kick).not.toHaveBeenCalled();
    jest.advanceTimersByTime(30_000);
    expect(kick).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000);
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it('flush kicks at once and does nothing when empty; a failing persist is reported, not thrown', async () => {
    const onError = jest.fn();
    const kick = jest.fn();
    const batcher = createBuddyTapBatcher(async () => { throw new Error('disk'); }, kick, 30_000, onError);
    batcher.flush();
    expect(kick).not.toHaveBeenCalled();
    batcher.add(2);
    batcher.flush();
    expect(kick).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalled();
  });
});

describe('addBuddyTap on the sync engine', () => {
  async function joined() {
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    await repos.sync.saveState({ cursor: 7, lastSyncAt: 1 });
    return repos;
  }
  const ok = { clientId: 'c', ok: true, replayed: false, den: apiDen({ rev: 1 }), serverTime: 1, seq: 1 };

  it('coalesces taps into one unsent row, and the push (before the pull) carries all of them', async () => {
    const repos = await joined();
    const command = jest.fn(async (_req: { command: CommandBody }) => ok);
    const engine = makeEngine(repos, { command, events: async () => ({ events: [], cursor: 7, hasMore: false, serverTime: 2 }) });
    await engine.addBuddyTap(2);
    await engine.addBuddyTap(3);
    await engine.addBuddyTap(1);
    const pending = await repos.sync.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].payload).toEqual({ kind: 'den.buddyTaps', taps: 3, treats: 6 });
    await engine.syncNow({ force: true });
    expect(command).toHaveBeenCalledTimes(1);
    expect(command.mock.calls[0][0].command).toEqual({ kind: 'den.buddyTaps', taps: 3, treats: 6 });
  });

  it('starts a fresh row after the first was tried, and is a no-op when not joined', async () => {
    const repos = await joined();
    const command = jest.fn(async () => { throw new ApiError('network', 'down'); });
    const engine = makeEngine(repos, { command, events: async () => ({ events: [], cursor: 7, hasMore: false, serverTime: 2 }) });
    await engine.addBuddyTap(1);
    await engine.syncNow({ force: true }); // attempt burned
    await engine.addBuddyTap(2);
    expect(await repos.sync.getPending()).toHaveLength(2);
    const lone = makeEngine(makeRepos(), {});
    await lone.addBuddyTap(1);
  });
});
