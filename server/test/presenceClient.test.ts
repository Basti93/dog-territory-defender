// The app's real ApiClient talking to the real server over a socket: proves the two halves of the presence channel agree
// on paths, query parameters and body shapes (the unit tests on each side use fakes).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApiClient } from '@game/sync/apiClient';
import { joinNew, makeServer, newHousehold, NOW, type Member, type TestServer } from './helpers';

let s: TestServer;
let sam: Member;
let alex: Member;
let baseUrl: string;

beforeEach(async () => {
  s = await makeServer();
  const hid = (await newHousehold(s)).id;
  sam = await joinNew(s, hid, 'Sam', '10.0.0.1');
  alex = await joinNew(s, hid, 'Alex', '10.0.0.2');
  baseUrl = await s.app.listen({ port: 0, host: '127.0.0.1' });
});
afterEach(() => s.close());

describe('app client <-> server presence', () => {
  it('Alex\'s heartbeat wakes Sam\'s parked long-poll, and her closing beat wakes it again', async () => {
    const forSam = createApiClient({ baseUrl, token: sam.token });
    const forAlex = createApiClient({ baseUrl, token: alex.token });

    const first = await forSam.presence();
    expect(first.presence).toEqual([]);

    const t0 = Date.now();
    const parked = forSam.presence({ after: first.rev, waitSeconds: 25 });
    await new Promise((r) => setTimeout(r, 150));
    await forAlex.sendPresence({ walkId: 'walk-alex-1', startedAt: NOW, points: [{ lat: 48.137, lon: 11.575, t: NOW }] });
    const seen = await parked;
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(seen.presence).toHaveLength(1);
    expect(seen.presence[0]).toMatchObject({ name: 'Alex', walkId: 'walk-alex-1' });

    const parkedAgain = forSam.presence({ after: seen.rev, waitSeconds: 25 });
    await new Promise((r) => setTimeout(r, 150));
    s.setNow(NOW + 20_000); // the rev is the newest update time: a later beat is a later rev
    await forAlex.sendPresence({ walkId: 'walk-alex-1', startedAt: NOW, points: [], ended: true });
    expect((await parkedAgain).presence).toEqual([]);
  });

  it('a parked long-poll can be aborted by the client (app went to the background) without hurting the server', async () => {
    const forSam = createApiClient({ baseUrl, token: sam.token });
    const first = await forSam.presence();
    const controller = new AbortController();
    const parked = forSam.presence({ after: first.rev, waitSeconds: 25, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 100));
    controller.abort();
    await expect(parked).rejects.toMatchObject({ kind: 'network' });
    expect((await forSam.presence()).presence).toEqual([]);
  });
});
