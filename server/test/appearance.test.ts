// Shared dog look (appearance.set): validated like the app's normalizeAppearance, last writer wins, seed only when unset.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiEvent, CommandBody, CommandResponse, SnapshotResponse } from '@game/sync/apiContract';
import { FUR_ZONES, validateAppearance } from '@game/buddy/buddyAppearance';
import { joinNew, makeServer, newHousehold, type Member, type TestServer } from './helpers';

let s: TestServer;
let a: Member;
let b: Member;
beforeEach(async () => {
  s = await makeServer();
  const hid = (await newHousehold(s)).id;
  a = await joinNew(s, hid, 'Sam', '10.0.0.1');
  b = await joinNew(s, hid, 'Alex', '10.0.0.2');
});
afterEach(async () => {
  await s.close();
});

const LEGACY = { coat: 'ginger', markings: 'socks', earStyle: 'pointy', tailStyle: 'straight', size: 'large', accentColour: 'tan' };
const zones = () => Object.fromEntries(FUR_ZONES.map((z) => [z, '#C8A27A']));
const FUR = { ...LEGACY, fur: { zones: zones(), muzzle: 'long', furLength: 'fluffy' } };

const post = (m: Member, clientId: string, command: CommandBody) =>
  s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: { clientId, command } });
const snapshot = async (m: Member) => (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
const events = async (m: Member) =>
  (await s.app.inject({ method: 'GET', url: '/v1/events?after=0', headers: m.auth })).json<{ events: ApiEvent[] }>().events;

describe('appearance.set', () => {
  it('starts as null, stores a look, bumps the rev, emits an event, and the partner sees it in the snapshot', async () => {
    expect((await snapshot(b)).dog.appearanceRev).toBe(0);
    expect((await post(a, 'client-look-0001', { kind: 'appearance.set', appearance: FUR })).statusCode).toBe(200);
    const snap = await snapshot(b);
    expect(snap.dog.appearanceRev).toBe(1);
    expect(snap.dog.appearance).toMatchObject({ coat: 'ginger', fur: { muzzle: 'long', furLength: 'fluffy' } });
    const ev = (await events(b)).find((e) => e.kind === 'dog.appearance');
    expect(ev?.payload).toMatchObject({ rev: 1 });
  });

  it('last writer wins; an ifUnset seed does nothing once a look exists; a replay does not bump twice', async () => {
    await post(a, 'client-look-0002', { kind: 'appearance.set', appearance: LEGACY });
    await post(b, 'client-look-0003', { kind: 'appearance.set', appearance: FUR });
    expect((await snapshot(a)).dog).toMatchObject({ appearanceRev: 2, appearance: { fur: { furLength: 'fluffy' } } });
    const seed = await post(a, 'client-look-0004', { kind: 'appearance.set', appearance: LEGACY, ifUnset: true });
    expect(seed.json<CommandResponse>().ok).toBe(true);
    const replay = await post(b, 'client-look-0003', { kind: 'appearance.set', appearance: FUR });
    expect(replay.json<CommandResponse>().replayed).toBe(true);
    expect((await snapshot(a)).dog.appearanceRev).toBe(2);
  });

  it('seeds a household nobody claimed', async () => {
    await post(a, 'client-look-0005', { kind: 'appearance.set', appearance: LEGACY, ifUnset: true });
    expect((await snapshot(b)).dog.appearanceRev).toBe(1);
  });

  it('rejects unknown options, bad hexes, incomplete fur and oversize input with 400, and softens neon colours', async () => {
    const bad = [
      { ...LEGACY, coat: 'neon' },
      { coat: 'golden' },
      { ...LEGACY, fur: { zones: { ...zones(), head: 'red' }, muzzle: 'long', furLength: 'short' } },
      { ...LEGACY, fur: { zones: { head: '#C8A27A' }, muzzle: 'long', furLength: 'short' } },
      { ...LEGACY, fur: { zones: zones(), muzzle: 'pug', furLength: 'short' } },
      { ...LEGACY, note: 'x'.repeat(3000) },
    ];
    for (const [i, appearance] of bad.entries()) {
      expect((await post(a, `client-bad-${i}0000`, { kind: 'appearance.set', appearance })).statusCode).toBe(400);
    }
    expect((await snapshot(a)).dog.appearanceRev).toBe(0);
    await post(a, 'client-look-0006', { kind: 'appearance.set', appearance: { ...LEGACY, fur: { zones: { ...zones(), head: '#00FF00' }, muzzle: 'short', furLength: 'short' } } });
    const stored = (await snapshot(a)).dog.appearance as { fur: { zones: Record<string, string> } };
    expect(stored.fur.zones.head).not.toBe('#00FF00');
  });
});

describe('validateAppearance', () => {
  it('accepts a legacy look unchanged and drops unknown keys', () => {
    expect(validateAppearance({ ...LEGACY, extra: 1 })).toEqual(LEGACY);
    expect(validateAppearance(null)).toBeNull();
    expect(validateAppearance([])).toBeNull();
  });
});
