// All configuration comes from env (12-factor, design Decision 13). Tests build a Config directly.
export interface Config {
  port: number;
  /** Internal readiness listener (/readyz). 0 disables it. Never publish this port. */
  readyPort: number;
  databaseUrl: string;
  logLevel: string;
  nodeEnv: string;
  householdMaxPlayers: number;
  /** CIDR whose X-Forwarded-For is trusted (the Tailscale sidecar's network). Also never banned. */
  trustProxyCidr: string;
  /** Debug aid: log req.ip + raw forwarded headers for the first 50 requests (LOG_FORWARDED_HEADERS=true). */
  logForwardedHeaders: boolean;
  inviteTtlMs: number;
  /** Apps announcing a lower X-Client-Api-Level (or none = 1) get 426 on mutating routes. Default 1 = nobody is refused. */
  minClientApiLevel: number;
  /** Track B (Nachbarhunde). Off by default; off = nearby is [], scheduler idle, no bots are created. */
  neighbours: {
    enabled: boolean;
    /** Overpass interpreter URL; empty = never fetch, the offset fallback generator is used. */
    overpassUrl: string;
    /** Pause between sequential tile fetches. */
    overpassPauseMs: number;
  };
  limits: {
    unauthPerMinPerIp: number;
    anyPerMinPerIp: number;
    devicePerMin: number;
    joinPerMinPerIp: number;
    joinPerDayPerIp: number;
    joinPerHourGlobal: number;
    commandsPerDayPerHousehold: number;
    walksPerDayPerHousehold: number;
    maxLongPollWaitersPerHousehold: number;
  };
}

function int(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return {
    port: int('PORT', 7000, env),
    readyPort: int('READY_PORT', 7100, env),
    databaseUrl,
    logLevel: env.LOG_LEVEL ?? 'info',
    nodeEnv: env.NODE_ENV ?? 'production',
    householdMaxPlayers: int('HOUSEHOLD_MAX_PLAYERS', 4, env),
    trustProxyCidr: env.TRUST_PROXY_CIDR ?? '172.16.0.0/12',
    logForwardedHeaders: env.LOG_FORWARDED_HEADERS === 'true',
    inviteTtlMs: 24 * 60 * 60 * 1000,
    minClientApiLevel: int('MIN_CLIENT_API_LEVEL', 1, env),
    neighbours: {
      enabled: env.NEIGHBOURS_ENABLED === 'true',
      overpassUrl: env.OVERPASS_URL ?? '',
      overpassPauseMs: int('OVERPASS_PAUSE_MS', 2000, env),
    },
    limits: {
      unauthPerMinPerIp: int('RL_UNAUTH_PER_MIN', 30, env),
      anyPerMinPerIp: int('RL_ANY_PER_MIN', 600, env),
      devicePerMin: int('RL_DEVICE_PER_MIN', 120, env),
      joinPerMinPerIp: int('RL_JOIN_PER_MIN', 5, env),
      joinPerDayPerIp: int('RL_JOIN_PER_DAY', 20, env),
      joinPerHourGlobal: int('RL_JOIN_PER_HOUR_GLOBAL', 100, env),
      commandsPerDayPerHousehold: int('CAP_COMMANDS_PER_DAY', 200, env),
      walksPerDayPerHousehold: int('CAP_WALKS_PER_DAY', 50, env),
      maxLongPollWaitersPerHousehold: int('MAX_LONGPOLL_WAITERS', 8, env),
    },
  };
}
