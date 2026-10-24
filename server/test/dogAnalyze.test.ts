// POST /v1/dog/analyze: the LiteLLM chat/completions call is mocked (no live calls). Photos must never reach logs or storage.
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { FUR_ZONES } from '@game/buddy/buddyAppearance';
import { buildApp } from '../src/http/app';
import { NOW, joinNew, makeDb, newHousehold, testConfig, type Member, type TestServer } from './helpers';

const KEY = 'sk-litellm-test-SECRET';
const MARKER = 'UNIQUEPHOTOMARKER';
// "/9j/" = JPEG magic in base64; padded to pass the minimum length.
const photo = (marker = MARKER) => `/9j/${marker}${'A'.repeat(200)}`;

const goodAnswer = {
  isDog: true,
  confidence: 'high',
  zones: Object.fromEntries(FUR_ZONES.map((z) => [z, z === 'back' ? '#B5651D' : '#F3E3C3'])),
  muzzle: 'long',
  furLength: 'fluffy',
  earStyle: 'pointy',
  tailStyle: 'curly',
  size: 'large',
};
const chatReply = (content: string, usage?: { prompt_tokens: number; completion_tokens: number }) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });

interface Rig {
  s: TestServer;
  member: Member;
  calls: { url: string; headers: Record<string, string>; body: string }[];
  logs: string[];
}
const open: Rig[] = [];
afterEach(async () => {
  for (const r of open.splice(0)) await r.s.close();
});

async function rig(opts: { apiKey?: string; baseUrl?: string; reply?: () => Response; vision?: Partial<ReturnType<typeof testConfig>['vision']>; logging?: boolean } = {}): Promise<Rig> {
  const calls: Rig['calls'] = [];
  const logs: string[] = [];
  const { db, pg } = await makeDb();
  const base = testConfig();
  const config = {
    ...base,
    logLevel: opts.logging ? 'trace' : 'silent',
    vision: { ...base.vision, apiKey: opts.apiKey ?? KEY, ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}), ...opts.vision },
  };
  const visionFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    return (opts.reply ?? (() => chatReply(JSON.stringify(goodAnswer))))();
  }) as unknown as typeof fetch;
  const { app } = await buildApp({
    db,
    config,
    now: () => NOW,
    visionFetch,
    ...(opts.logging ? { logStream: { write: (m: string) => logs.push(m) } } : { logger: false as const }),
  });
  await app.ready();
  const s = { app, db, now: NOW, setNow: () => {}, close: async () => { await app.close(); await pg.close(); } } as TestServer;
  const member = await joinNew(s, (await newHousehold(s)).id);
  const r = { s, member, calls, logs };
  open.push(r);
  return r;
}

const analyze = (r: Rig, photos: string[] = [photo()]) =>
  (r.s.app as FastifyInstance).inject({ method: 'POST', url: '/v1/dog/analyze', headers: r.member.auth, payload: { photos } });

describe('POST /v1/dog/analyze', () => {
  it('returns a softened, valid look and sends all photos in ONE strict-schema request with a Bearer key', async () => {
    const r = await rig();
    const res = await analyze(r, [photo('a'), photo('b'), photo('c')]);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.confidence).toBe('high');
    expect(body.appearance).toMatchObject({ earStyle: 'pointy', size: 'large', fur: { muzzle: 'long', furLength: 'fluffy' } });
    expect(Object.keys(body.appearance.fur.zones)).toHaveLength(FUR_ZONES.length);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].url).toBe('http://litellm.test:4000/v1/chat/completions');
    expect(r.calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    const sent = JSON.parse(r.calls[0].body);
    expect(sent).toMatchObject({ model: 'dtd-vision-test', temperature: 0.2, response_format: { type: 'json_schema', json_schema: { name: 'dog_look', strict: true } } });
    const parts = sent.messages[0].content as { type: string; image_url?: { url: string } }[];
    expect(parts[0].type).toBe('text');
    expect(parts.filter((p) => p.type === 'image_url')).toHaveLength(3);
    expect(parts[1].image_url!.url.startsWith('data:image/jpeg;base64,/9j/')).toBe(true);
  });

  it('softens a neon colour', async () => {
    const neon = { ...goodAnswer, zones: { ...goodAnswer.zones, back: '#00FF00' } };
    const r = await rig({ reply: () => chatReply(JSON.stringify(neon)) });
    expect((await analyze(r)).json().appearance.fur.zones.back).not.toBe('#00FF00');
  });

  it('answers 502 analysis_failed for invalid JSON, a wrong shape, a provider error and a thrown fetch, and gives the quota back', async () => {
    for (const reply of [
      () => chatReply('not json {'),
      () => chatReply(JSON.stringify({ isDog: true, zones: {} })),
      () => new Response('nope', { status: 500 }),
      () => {
        throw new Error('network down');
      },
    ]) {
      const r = await rig({ reply });
      for (let i = 0; i < 5; i++) {
        const res = await analyze(r);
        expect(res.statusCode).toBe(502);
        expect(res.json()).toEqual({ error: 'analysis_failed' });
      }
    }
  });

  it('answers 422 analysis_no_dog when the model says it is not a dog', async () => {
    const r = await rig({ reply: () => chatReply(JSON.stringify({ ...goodAnswer, isDog: false })) });
    const res = await analyze(r);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'analysis_no_dog' });
  });

  it('allows 3 per household per day, then 429 analysis_limit without calling the provider', async () => {
    const r = await rig();
    for (let i = 0; i < 3; i++) expect((await analyze(r)).statusCode).toBe(200);
    const res = await analyze(r);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: 'analysis_limit' });
    expect(r.calls).toHaveLength(3);
  });

  it('stops at the global monthly cost cap (flat estimate without usage)', async () => {
    const r = await rig({ vision: { monthlyCapUsd: 0.01 } });
    expect((await analyze(r)).statusCode).toBe(200);
    expect((await analyze(r)).statusCode).toBe(200);
    expect((await analyze(r)).statusCode).toBe(429);
  });

  it('counts real token usage against the cap (0.75 / 3.75 USD per million)', async () => {
    // 1M prompt + 100k completion tokens = 0.75 + 0.375 = 1.125 USD
    const reply = () => chatReply(JSON.stringify(goodAnswer), { prompt_tokens: 1_000_000, completion_tokens: 100_000 });
    const r = await rig({ reply, vision: { monthlyCapUsd: 1.12 } });
    expect((await analyze(r)).statusCode).toBe(200);
    expect((await analyze(r)).statusCode).toBe(429);
  });

  it('is unavailable (503 analysis_unavailable) without LITELLM_API_KEY or URL', async () => {
    for (const opts of [{ apiKey: '' }, { baseUrl: '' }]) {
      const r = await rig(opts);
      const res = await analyze(r);
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ error: 'analysis_unavailable' });
      expect(r.calls).toHaveLength(0);
    }
  });

  it('needs auth and rejects non-JPEG, empty and too many photos', async () => {
    const r = await rig();
    const anon = await r.s.app.inject({ method: 'POST', url: '/v1/dog/analyze', payload: { photos: [photo()] } });
    expect(anon.statusCode).toBe(401);
    expect((await analyze(r, ['iVBORw0KGgo' + 'A'.repeat(200)])).statusCode).toBe(400);
    expect((await analyze(r, [])).statusCode).toBe(400);
    expect((await analyze(r, Array.from({ length: 6 }, () => photo()))).statusCode).toBe(400);
    expect(r.calls).toHaveLength(0);
  });

  it('never logs photos or the key, on success and on failure', async () => {
    const ok = await rig({ logging: true });
    await analyze(ok);
    const bad = await rig({ logging: true, reply: () => chatReply('garbage') });
    await analyze(bad);
    await analyze(bad, ['iVBORw0KGgo' + MARKER + 'A'.repeat(200)]); // rejected before the provider
    for (const line of [...ok.logs, ...bad.logs]) {
      expect(line).not.toContain(MARKER);
      expect(line).not.toContain(KEY);
    }
    expect(ok.logs.some((l) => l.includes('access'))).toBe(true);
  });
});
