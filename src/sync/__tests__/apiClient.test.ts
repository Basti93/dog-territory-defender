import { ApiError, createApiClient } from '../apiClient';
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
