import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { LogController, type FastifyInstance, type FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import type {
  ApiError,
  CommandRequest,
  ImportRequest,
  JoinRequest,
  CoopWeekResponse,
  GiftsResponse,
  NearbyResponse,
  SnapshotResponse,
  WalkUploadRequest,
} from '@game/sync/apiContract';
import { API_LIMITS, API_PATHS } from '@game/sync/apiContract';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { FixedWindowLimiter } from '../lib/limiter';
import { NEIGHBOUR_CONFIG } from '@game/economy/neighbourConfig';
import { getCoopWeek, inactiveCoopWeek } from '../neighbours/coop';
import { listGifts } from '../neighbours/gifts';
import { getNearby } from '../neighbours/nearby';
import { runCommand } from '../services/commands';
import { EventBus, pullEventsLongPoll } from '../services/events';
import { buildSnapshot, joinHousehold } from '../services/households';
import { importHousehold } from '../services/importSeed';
import { getWalk, ingestWalk, type AuthCtx } from '../services/walks';
import { DeviceTokenAuthenticator, type Authenticator } from './auth';
import { IpBanList } from './ipBan';
import {
  CommandSchema,
  GiftOpenBodySchema,
  GiftParamsSchema,
  ImportSchema,
  EventsQuerySchema,
  JoinSchema,
  NearbyQuerySchema,
  WalkParamsSchema,
  WalkUploadSchema,
} from './schemas';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthCtx;
  }
}

export interface AppDeps {
  db: Db;
  config: Config;
  /** Defaults to pino at config.logLevel; tests pass false. */
  logger?: false;
  authenticator?: Authenticator;
  now?: () => number;
}

const UNAUTHORIZED: ApiError = { error: 'unauthorized' };
const WALK_BODY_LIMIT = 1024 * 1024;
const IMPORT_BODY_LIMIT = 5 * 1024 * 1024;

function isPublic(method: string, path: string): boolean {
  return (method === 'GET' && path === API_PATHS.healthz) || (method === 'POST' && path === API_PATHS.join);
}

export async function buildApp(deps: AppDeps): Promise<{ app: FastifyInstance; bus: EventBus; bans: IpBanList }> {
  const { db, config } = deps;
  const now = deps.now ?? Date.now;
  const authenticator = deps.authenticator ?? new DeviceTokenAuthenticator(db);
  const bus = new EventBus();
  const bans = new IpBanList(db, config.trustProxyCidr);
  await bans.load();

  const app = Fastify({
    logger:
      deps.logger === false
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: ['req.headers.authorization', 'headers.authorization', '*.token', '*.code', '*.locations', '*.route'],
              censor: '[redacted]',
            },
          },
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: config.trustProxyCidr,
    bodyLimit: 64 * 1024,
    // removeAdditional off so `additionalProperties:false` REJECTS unknown properties instead of stripping them.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array', useDefaults: true, allErrors: false } },
  });

  const deviceLimiter = new FixedWindowLimiter(config.limits.devicePerMin, 60_000);
  const joinDayLimiter = new FixedWindowLimiter(config.limits.joinPerDayPerIp, 24 * 3600_000);
  const joinHourGlobal = new FixedWindowLimiter(config.limits.joinPerHourGlobal, 3600_000);

  // Fastify ships a default text/plain parser; this API is JSON only (415 for everything else).
  app.removeContentTypeParser('text/plain');

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  // No CORS plugin on purpose: the only client is the native app.

  app.addHook('onSend', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  // Debug aid for the Funnel setup: which client IP does Fastify derive, and what did the proxy send?
  // trustProxy (= TRUST_PROXY_CIDR) already means X-Forwarded-For is only honoured from that network;
  // Tailscale-Ingress-Src is never used for decisions, only logged here.
  let forwardedLogged = 0;
  if (config.logForwardedHeaders) {
    app.addHook('onRequest', async (req) => {
      if (forwardedLogged >= 50) return;
      forwardedLogged++;
      req.log.info(
        {
          reqIp: req.ip,
          socketAddr: req.socket.remoteAddress,
          xForwardedFor: req.headers['x-forwarded-for'],
          tailscaleIngressSrc: req.headers['tailscale-ingress-src'],
          n: forwardedLogged,
        },
        'forwarded-headers'
      );
    });
  }

  // 1) banned IPs
  app.addHook('onRequest', async (req, reply) => {
    const secs = bans.bannedFor(req.ip, now());
    if (secs > 0) {
      reply.header('Retry-After', String(secs));
      return reply.code(429).send({ error: 'rate_limited' } satisfies ApiError);
    }
  });

  // 2) rate limits, before any DB lookup. Requests with a bearer share a generous per-IP ceiling
  // (the per-device limit follows after auth); requests without one get the strict 30/min.
  const hasBearer = (req: FastifyRequest) => (req.headers.authorization ?? '').startsWith('Bearer ');
  await app.register(rateLimit, {
    global: true,
    keyGenerator: (req) => `${req.ip}:${hasBearer(req) ? 'b' : 'n'}`,
    max: (req) => (hasBearer(req) ? config.limits.anyPerMinPerIp : config.limits.unauthPerMinPerIp),
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({ statusCode: 429, error: 'rate_limited' }),
  });

  // 3) auth: everything except GET /healthz and POST /v1/join needs a valid token, unknown paths included.
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (isPublic(req.method, path)) return;
    const result = await authenticator.authenticate(req.headers.authorization);
    if (!result.ok) {
      if (result.strike) await bans.strike(req.ip, 'failed-auth', now());
      return reply.code(401).send(UNAUTHORIZED);
    }
    const auth = result.auth;
    if (!deviceLimiter.hit(auth.deviceId, now())) {
      reply.header('Retry-After', String(deviceLimiter.retryAfterSeconds(auth.deviceId, now())));
      return reply.code(429).send({ error: 'rate_limited' } satisfies ApiError);
    }
    req.auth = auth;
  });

  // structured access log: route template only, never the raw URL/query, never tokens
  app.addHook('onResponse', async (req, reply) => {
    req.log.info(
      {
        ip: req.ip,
        method: req.method,
        route: req.routeOptions?.url ?? 'unmatched',
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
        deviceId: req.auth?.deviceId,
      },
      'access'
    );
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found' } satisfies ApiError));

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    if (err.validation) return reply.code(400).send({ error: 'bad_request' } satisfies ApiError);
    const status = err.statusCode ?? 500;
    if (status === 413) return reply.code(413).send({ error: 'payload_too_large' } satisfies ApiError);
    if (status === 415) return reply.code(415).send({ error: 'unsupported_media_type' } satisfies ApiError);
    if (status === 429) return reply.code(429).send({ error: 'rate_limited' } satisfies ApiError);
    if (status >= 400 && status < 500) return reply.code(400).send({ error: 'bad_request' } satisfies ApiError);
    req.log.error({ err: { message: err.message, name: err.name } }, 'unhandled');
    return reply.code(500).send({ error: 'internal' } satisfies ApiError);
  });

  // ------------------------------------------------------------------ routes

  app.get(API_PATHS.healthz, async () => ({ ok: true }));

  app.post(
    API_PATHS.join,
    {
      schema: { body: JoinSchema },
      config: {
        rateLimit: { max: config.limits.joinPerMinPerIp, timeWindow: '1 minute', keyGenerator: (req: FastifyRequest) => req.ip },
      },
    },
    async (req, reply) => {
      const t = now();
      if (!joinDayLimiter.hit(req.ip, t) || !joinHourGlobal.hit('global', t)) {
        reply.header('Retry-After', '3600');
        return reply.code(429).send({ error: 'rate_limited' } satisfies ApiError);
      }
      const result = await joinHousehold(db, bus, config, req.body as JoinRequest, t);
      if (result.kind === 'refused') {
        await bans.strike(req.ip, 'failed-join', t);
        return reply.code(403).send({ error: 'invalid_invite' } satisfies ApiError);
      }
      return result.response;
    }
  );

  app.get(API_PATHS.snapshot, async (req): Promise<SnapshotResponse> => buildSnapshot(db, req.auth!, now()));

  app.post(
    API_PATHS.walks,
    { schema: { body: WalkUploadSchema }, bodyLimit: WALK_BODY_LIMIT },
    async (req, reply) => {
      const result = await ingestWalk(db, bus, config, req.auth!, req.body as WalkUploadRequest, now());
      if (result.kind === 'rejected') {
        return reply.code(422).send({ error: 'walk_rejected', reason: result.reason } satisfies ApiError);
      }
      if (result.kind === 'capped') return reply.code(429).send({ error: 'daily_cap' } satisfies ApiError);
      return result.response;
    }
  );

  app.post(
    API_PATHS.import,
    { schema: { body: ImportSchema }, bodyLimit: IMPORT_BODY_LIMIT },
    async (req, reply) => {
      const result = await importHousehold(db, bus, req.auth!, req.body as ImportRequest, now());
      if (result.kind === 'not-allowed') return reply.code(409).send({ error: 'import_not_allowed' } satisfies ApiError);
      return result.response;
    }
  );

  app.get(API_PATHS.walks + '/:id', { schema: { params: WalkParamsSchema } }, async (req, reply) => {
    const walk = await getWalk(db, req.auth!.householdId, (req.params as { id: string }).id);
    if (!walk) return reply.code(404).send({ error: 'not_found' } satisfies ApiError);
    return walk;
  });

  app.post(API_PATHS.commands, { schema: { body: CommandSchema } }, async (req, reply) => {
    const result = await runCommand(db, bus, config, req.auth!, req.body as CommandRequest, now());
    if (result.kind === 'conflict') return reply.code(409).send({ error: 'client_id_reuse' } satisfies ApiError);
    if (result.kind === 'capped') return reply.code(429).send({ error: 'daily_cap' } satisfies ApiError);
    return result.response;
  });

  app.get(API_PATHS.events, { schema: { querystring: EventsQuerySchema } }, async (req) => {
    const q = req.query as { after: number; wait: number; limit: number };
    const abort = new AbortController();
    req.raw.on('close', () => abort.abort());
    return pullEventsLongPoll(
      db,
      bus,
      req.auth!.householdId,
      q.after,
      q.limit,
      Math.min(q.wait, API_LIMITS.maxEventWaitSeconds),
      config.limits.maxLongPollWaitersPerHousehold,
      abort.signal
    );
  });

  app.get(API_PATHS.nearby, { schema: { querystring: NearbyQuerySchema } }, async (req): Promise<NearbyResponse> => {
    const q = req.query as { radiusM?: number; include?: 'cells' };
    return getNearby(db, config, req.auth!.householdId, q.radiusM ?? NEIGHBOUR_CONFIG.nearby.defaultRadiusM, q.include === 'cells', now());
  });

  app.get(API_PATHS.gifts, async (req): Promise<GiftsResponse> => listGifts(db, req.auth!.householdId));

  // Opening a gift is an ordinary idempotent command (den_state lock, command log, daily cap).
  app.post(
    API_PATHS.gifts + '/:id/open',
    { schema: { params: GiftParamsSchema, body: GiftOpenBodySchema } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { clientId } = req.body as { clientId: string };
      const result = await runCommand(db, bus, config, req.auth!, { clientId, command: { kind: 'gift.open', giftId: id } }, now());
      if (result.kind === 'conflict') return reply.code(409).send({ error: 'client_id_reuse' } satisfies ApiError);
      if (result.kind === 'capped') return reply.code(429).send({ error: 'daily_cap' } satisfies ApiError);
      return result.response;
    }
  );

  app.get(API_PATHS.coopWeek, async (req): Promise<CoopWeekResponse> =>
    config.neighbours.enabled ? getCoopWeek(db, req.auth!.householdId, now()) : inactiveCoopWeek()
  );

  return { app, bus, bans };
}

/** Internal listener for container/operator health checks. Never published to the host. */
export function buildReadyApp(db: Db): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/readyz', async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
  return app;
}
