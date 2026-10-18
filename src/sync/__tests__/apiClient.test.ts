import { ApiError, createApiClient } from '../apiClient';
import { API_LEVEL } from '../apiContract';
import { jsonResponse } from '../../test/syncHelpers';

const client = (fetchImpl: unknown, timeoutMs = 50) =>
  createApiClient({ baseUrl: 'https://x.test/', token: 'tok', timeoutMs, fetchImpl: fetchImpl as typeof fetch });

describe('apiClient', () => {
  it('sends the bearer token and builds the events URL', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { events: [], cursor: 3, hasMore: false, serverTime: 1 }));
    await client(fetchImpl).events(3);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.test/v1/events?after=3');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('announces the API level the app was built for on every request', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { events: [], cursor: 0, hasMore: false, serverTime: 1 }));
    await client(fetchImpl).events(0);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Client-Api-Level']).toBe(String(API_LEVEL));
  });

  it('maps HTTP 426 to upgrade-required, which is not retryable but carries the code', async () => {
    const err = await client(async () => jsonResponse(426, { error: 'upgrade_required' })).command({ clientId: 'c', command: { kind: 'player.rename', name: 'x' } }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe('upgrade-required');
    expect(err.status).toBe(426);
    expect(err.code).toBe('upgrade_required');
    expect(err.retryable).toBe(false);
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'client'],
    [422, 'client'],
    [429, 'server'],
    [500, 'server'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const err = await client(async () => jsonResponse(status, { error: 'x' })).snapshot().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe(kind);
  });

  it('maps a thrown fetch to network and a hung one to timeout', async () => {
    const down = await client(async () => { throw new TypeError('Network request failed'); }).snapshot().catch((e) => e);
    expect(down.kind).toBe('network');
    expect(down.retryable).toBe(true);
    const hung = (async (_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown;
    const slow = await client(hung, 20).snapshot().catch((e) => e);
    expect(slow.kind).toBe('timeout');
  });
});

describe('apiClient presence', () => {
  it('posts a heartbeat and builds the long-poll URL, with a timeout that outlives the server wait', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { ok: true }));
    const c = client(fetchImpl);
    await c.sendPresence({ walkId: 'w1', startedAt: 1, points: [{ lat: 1, lon: 2, t: 3 }] });
    const [postUrl, postInit] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(postUrl).toBe('https://x.test/v1/presence');
    expect(postInit.method).toBe('POST');
    expect(JSON.parse(postInit.body as string)).toEqual({ walkId: 'w1', startedAt: 1, points: [{ lat: 1, lon: 2, t: 3 }] });

    fetchImpl.mockImplementation(async () => jsonResponse(200, { rev: 3, presence: [], serverTime: 1 }));
    await c.presence();
    await c.presence({ after: 3, waitSeconds: 25 });
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toBe('https://x.test/v1/presence');
    expect((fetchImpl.mock.calls[2] as unknown as [string])[0]).toBe('https://x.test/v1/presence?after=3&wait=25');
  });

  it('a long-poll is not cut off at the normal request timeout', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          setTimeout(() => resolve(jsonResponse(200, { rev: 1, presence: [], serverTime: 1 })), 120);
        })
    );
    // the plain timeout is 50 ms; the long-poll gets wait + grace
    await expect(client(fetchImpl as unknown).presence({ after: 1, waitSeconds: 25 })).resolves.toMatchObject({ rev: 1 });
    await expect(client(fetchImpl as unknown).snapshot()).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('an abort from outside (app went to the background) ends the call as a network error', async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const pending = client(fetchImpl as unknown).presence({ after: 1, waitSeconds: 25, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'network' });
  });
});
