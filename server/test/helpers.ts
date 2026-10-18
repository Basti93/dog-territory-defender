import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { JoinResponse, WalkUploadRequest } from '@game/sync/apiContract';
import type { Config } from '../src/config';
import type { Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { buildApp } from '../src/http/app';
import { createHousehold, createInvite } from '../src/services/households';

export const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);

export function testConfig(overrides: Partial<Config['limits']> = {}, neighbours: Partial<Config['neighbours']> = {}, minClientApiLevel = 1): Config {
  return {
    port: 0,
    readyPort: 0,
    databaseUrl: 'pglite://memory',
    logLevel: 'silent',
    nodeEnv: 'test',
    householdMaxPlayers: 4,
    trustProxyCidr: '172.16.0.0/12',
    logForwardedHeaders: false,
    inviteTtlMs: 24 * 3600_000,
    minClientApiLevel,
    neighbours: { enabled: false, overpassUrl: '', overpassPauseMs: 0, ...neighbours },
    limits: {
      unauthPerMinPerIp: 10_000,
      anyPerMinPerIp: 10_000,
      devicePerMin: 10_000,
      joinPerMinPerIp: 10_000,
      joinPerDayPerIp: 10_000,
      joinPerHourGlobal: 10_000,
      commandsPerDayPerHousehold: 200,
      walksPerDayPerHousehold: 50,
      maxLongPollWaitersPerHousehold: 8,
      ...overrides,
    },
  };
}

let template: Promise<Blob | File> | null = null;

/** Migrates once per test file, then clones the migrated data dir for every test (PGlite start-up is the slow part). */
async function migratedTemplate(): Promise<Blob | File> {
  const pg = new PGlite();
  await migrate(drizzle(pg, { schema }), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  const dump = await pg.dumpDataDir('none');
  await pg.close();
  return dump;
}

export async function makeDb(): Promise<{ db: Db; pg: PGlite }> {
  template ??= migratedTemplate();
  const pg = new PGlite({ loadDataDir: await template });
  return { db: drizzle(pg, { schema }) as unknown as Db, pg };
}

export interface TestServer {
  app: FastifyInstance;
  db: Db;
  now: number;
  setNow(ms: number): void;
  close(): Promise<void>;
}

export async function makeServer(
  limits: Partial<Config['limits']> = {},
  neighbours: Partial<Config['neighbours']> = {},
  minClientApiLevel = 1
): Promise<TestServer> {
  const { db, pg } = await makeDb();
  const state = { now: NOW };
  const { app } = await buildApp({ db, config: testConfig(limits, neighbours, minClientApiLevel), logger: false, now: () => state.now });
  await app.ready();
  return {
    app,
    db,
    get now() {
      return state.now;
    },
    setNow: (ms) => {
      state.now = ms;
    },
    close: async () => {
      await app.close();
      await pg.close();
    },
  } as TestServer;
}

export interface Member {
  token: string;
  auth: { authorization: string };
  join: JoinResponse;
  householdId: string;
}

/** Creates a household via the operator service and joins one player through the real HTTP route. */
export async function joinNew(s: TestServer, householdId: string, playerName = 'Sam', ip = '10.0.0.1'): Promise<Member> {
  const invite = await createInvite(s.db, householdId, 24 * 3600_000, s.now);
  const res = await s.app.inject({
    method: 'POST',
    url: '/v1/join',
    remoteAddress: ip,
    payload: { code: invite.code, playerName, deviceLabel: 'test phone', consent: true },
  });
  if (res.statusCode !== 200) throw new Error(`join failed: ${res.statusCode} ${res.body}`);
  const join = res.json<JoinResponse>();
  return { token: join.token, auth: { authorization: `Bearer ${join.token}` }, join, householdId };
}

export async function newHousehold(s: TestServer, name = 'Muster', timezone = 'Europe/Berlin', allowImport = false) {
  return createHousehold(s.db, name, timezone, s.now, allowImport);
}

/**
 * A straight walk heading north from (lat, lon), `meters` long, ~1.4 m/s with a fix every 5 s.
 * 400 m paints well over the 25-cell reward floor.
 */
export function straightWalk(id: string, startTime: number, opts: { lat?: number; lon?: number; meters?: number } = {}): WalkUploadRequest {
  const lat0 = opts.lat ?? 48.137;
  const lon = opts.lon ?? 11.575;
  const meters = opts.meters ?? 400;
  const stepM = 7;
  const locations = [];
  for (let d = 0, i = 0; d <= meters; d += stepM, i++) {
    locations.push({ latitude: lat0 + d / 111320, longitude: lon, timestamp: startTime + i * 5000, accuracy: 5 });
  }
  return { id, startTime, startSource: 'button', locations };
}

export async function denRevOf(s: TestServer, householdId: string) {
  const [row] = await s.db.select().from(schema.denState).where(eq(schema.denState.householdId, householdId));
  return row;
}
