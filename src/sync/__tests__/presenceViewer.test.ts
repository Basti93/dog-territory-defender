import type { ApiClient } from '../apiClient';
import { ApiError } from '../apiClient';
import type { PresenceEntry, PresenceResponse } from '../apiContract';
import { clearPartnerPresence, getPartnerPresence } from '../presenceStore';
import { createPresenceViewer } from '../presenceViewer';
import { IDENTITY } from '../../test/syncHelpers';

const entry = (over: Partial<PresenceEntry> = {}): PresenceEntry => ({
  playerId: 'p-alex',
  name: 'Alex',
  walkId: 'w1',
  startedAt: 1,
  points: [{ lat: 52, lon: 13, t: 1 }],
  updatedAt: 1000,
  ...over,
});
const answer = (rev: number, presence: PresenceEntry[]): PresenceResponse => ({ rev, presence, serverTime: 2000 });

/** A scripted server: each presence() call takes the next step; `park` steps wait until the abort signal fires. */
function setup(steps: Array<PresenceResponse | Error | 'park'>, identity: typeof IDENTITY | null = IDENTITY) {
  const calls: Array<{ after?: number; waitSeconds?: number }> = [];
  const sleeps: number[] = [];
  const ended: Array<{ walkId: string; name: string }> = [];
  let i = 0;
  const client = {
    presence: jest.fn(async (opts: { after?: number; waitSeconds?: number; signal?: AbortSignal } = {}) => {
      calls.push({ after: opts.after, waitSeconds: opts.waitSeconds });
      const step = steps[Math.min(i++, steps.length - 1)];
      if (step === 'park') {
        await new Promise<void>((resolve) => opts.signal?.addEventListener('abort', () => resolve(), { once: true }));
        throw new ApiError('network', 'aborted');
      }
      if (step instanceof Error) throw step;
      return step;
    }),
  };
  const viewer = createPresenceViewer({
    getIdentity: async () => identity,
    createClient: () => client as unknown as ApiClient,
    now: () => 5_000,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    onWalkEnded: (w) => ended.push({ walkId: w.walkId, name: w.name }),
  });
  const settle = async () => {
    for (let k = 0; k < 20; k++) await new Promise((r) => setImmediate(r));
  };
  return { viewer, client, calls, sleeps, ended, settle };
}

afterEach(() => clearPartnerPresence());

describe('presence viewer', () => {
  it('reads once at once, then long-polls with the last rev and wait=25', async () => {
    const { viewer, calls, settle } = setup([answer(5, [entry()]), answer(6, [entry({ updatedAt: 1500 })]), 'park']);
    viewer.start();
    await settle();
    expect(calls).toEqual([{ after: undefined, waitSeconds: 0 }, { after: 5, waitSeconds: 25 }, { after: 6, waitSeconds: 25 }]);
    expect(getPartnerPresence()[0].updatedAt).toBe(1500);
    viewer.stop();
  });

  it('tells when a partner walk disappears from the answer (the walk ended)', async () => {
    const { viewer, ended, settle } = setup([answer(5, [entry()]), answer(6, []), 'park']);
    viewer.start();
    await settle();
    expect(ended).toEqual([{ walkId: 'w1', name: 'Alex' }]);
    expect(getPartnerPresence()).toEqual([]);
    viewer.stop();
  });

  it('does not report an ended walk for a walk that is simply still going', async () => {
    const { viewer, ended, settle } = setup([answer(5, [entry()]), answer(6, [entry({ updatedAt: 1800 })]), 'park']);
    viewer.start();
    await settle();
    expect(ended).toEqual([]);
    viewer.stop();
  });

  it('stop() aborts the parked long-poll, clears the sign and a second start() resumes', async () => {
    const { viewer, client, settle } = setup([answer(5, [entry()]), 'park']);
    viewer.start();
    viewer.start(); // already running: no second loop
    await settle();
    expect(client.presence).toHaveBeenCalledTimes(2);
    viewer.stop();
    await settle();
    expect(getPartnerPresence()).toEqual([]);
    expect(client.presence).toHaveBeenCalledTimes(2);
    viewer.start();
    await settle();
    expect(client.presence).toHaveBeenCalledTimes(3);
    viewer.stop();
  });

  it('stopping does not count as the walk ending', async () => {
    const { viewer, ended, settle } = setup([answer(5, [entry()]), 'park']);
    viewer.start();
    await settle();
    viewer.stop();
    await settle();
    expect(ended).toEqual([]);
  });

  it('backs off after errors and carries on', async () => {
    const { viewer, calls, sleeps, settle } = setup([new ApiError('network', 'down'), new ApiError('server', 'HTTP 500', 500), answer(1, []), 'park']);
    viewer.start();
    await settle();
    expect(sleeps).toEqual([2_000, 5_000]);
    expect(calls).toHaveLength(4);
    viewer.stop();
  });

  it('asks an old server without presence only now and then', async () => {
    const { viewer, calls, sleeps, settle } = setup([new ApiError('client', 'HTTP 404', 404), 'park']);
    viewer.start();
    await settle();
    expect(sleeps).toEqual([5 * 60_000]);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    viewer.stop();
  });

  it('gives up for this foreground when the token is refused', async () => {
    const { viewer, client, settle } = setup([new ApiError('unauthorized', 'HTTP 401', 401)]);
    viewer.start();
    await settle();
    expect(client.presence).toHaveBeenCalledTimes(1);
  });

  it('does not poll at all when the phone is not in a household', async () => {
    const { viewer, client, settle } = setup([answer(1, [])], null);
    viewer.start();
    await settle();
    expect(client.presence).not.toHaveBeenCalled();
  });

  it('does not spin when the server returns a long-poll at once with nothing new', async () => {
    const { viewer, sleeps, settle } = setup([answer(5, []), answer(5, []), 'park']);
    viewer.start();
    await settle();
    expect(sleeps).toEqual([2_000]);
    viewer.stop();
  });
});
