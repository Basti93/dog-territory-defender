import { afterEach, describe, expect, it } from 'vitest';
import { API_HEADERS, API_LEVEL } from '@game/sync/apiContract';
import { joinNew, makeServer, newHousehold, straightWalk, NOW, type TestServer } from './helpers';

let s: TestServer;
afterEach(async () => {
  await s.close();
});

const command = (clientId: string) => ({ clientId, command: { kind: 'den.upgrade', building: 'doghouse' } });

describe('API level handshake', () => {
  it('sends X-Api-Level on every response, including 401 and 404, and reports it in /healthz', async () => {
    s = await makeServer();
    const health = await s.app.inject({ method: 'GET', url: '/healthz' });
    expect(health.json()).toEqual({ ok: true, apiLevel: API_LEVEL });
    expect(health.headers['x-api-level']).toBe(String(API_LEVEL));
    const unauth = await s.app.inject({ method: 'GET', url: '/v1/snapshot' });
    expect(unauth.statusCode).toBe(401);
    expect(unauth.headers['x-api-level']).toBe(String(API_LEVEL));
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const missing = await s.app.inject({ method: 'GET', url: '/v1/walks/nope1234', headers: m.auth });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['x-api-level']).toBe(String(API_LEVEL));
  });

  it('refuses nobody by default, whatever the client header says', async () => {
    s = await makeServer();
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const res = await s.app.inject({ method: 'POST', url: '/v1/commands', headers: { ...m.auth, [API_HEADERS.clientLevel]: '1' }, payload: command('client-lvl-0001') });
    expect(res.statusCode).toBe(200);
  });

  it('answers 426 upgrade_required on mutating routes for older or header-less clients, but reads still work', async () => {
    s = await makeServer({}, {}, 2);
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id, 'Sam', '10.0.0.1'); // join is public and not gated
    const bodies: Array<[string, string, unknown]> = [
      ['POST', '/v1/commands', command('client-lvl-0002')],
      ['POST', '/v1/walks', straightWalk('walk-lvl-00001', NOW - 3600_000)],
      ['POST', '/v1/logs', { entries: [] }],
    ];
    for (const [method, url, payload] of bodies) {
      for (const headers of [m.auth, { ...m.auth, [API_HEADERS.clientLevel]: '1' }, { ...m.auth, [API_HEADERS.clientLevel]: 'abc' }]) {
        const res = await s.app.inject({ method: method as 'POST', url, headers, payload: payload as object });
        expect(res.statusCode, `${method} ${url}`).toBe(426);
        expect(res.json()).toEqual({ error: 'upgrade_required' });
        expect(res.headers['x-api-level']).toBe(String(API_LEVEL));
      }
    }
    for (const url of ['/v1/snapshot', '/v1/events?after=0', '/v1/nearby', '/v1/gifts', '/v1/coop/week']) {
      const res = await s.app.inject({ method: 'GET', url, headers: m.auth });
      expect(res.statusCode, url).toBe(200);
    }
  });

  it('lets a client at or above the minimum mutate, and checks auth before the level', async () => {
    s = await makeServer({}, {}, 2);
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const ok = await s.app.inject({ method: 'POST', url: '/v1/commands', headers: { ...m.auth, [API_HEADERS.clientLevel]: String(API_LEVEL) }, payload: command('client-lvl-0003') });
    expect(ok.statusCode).toBe(200);
    const noToken = await s.app.inject({ method: 'POST', url: '/v1/commands', payload: command('client-lvl-0004') });
    expect(noToken.statusCode).toBe(401);
  });
});
