// Household sync API contract, v1. OWNED BY THE SERVER SIDE (server/); the app's
// src/sync/ module imports it, the server imports it too, so there is exactly
// one definition. PURE TypeScript: no React Native, Expo, i18n or storage imports,
// and no runtime dependencies (request validation schemas live in
// server/src/http/schemas.ts and are compile-time checked against these types).
//
// Conventions: every timestamp is ms since epoch (number). Every request except
// POST /v1/join carries `Authorization: Bearer <device token>`. All bodies are
// application/json. Error bodies are `ApiError`.

import type { Location } from '../types';

export const API_PREFIX = '/v1';

/**
 * API level: a plain integer that only ever grows. The server sends it on every response (`X-Api-Level`) and in
 * `GET /healthz`; the app sends the level it was built for on every request (`X-Client-Api-Level`).
 * Rules: inside one level only additive fields; the server is rolled out BEFORE the app; a breaking change gets
 * `/v2` paths. The server may raise MIN_CLIENT_API_LEVEL (env) to refuse mutating requests from older apps with
 * 426 `upgrade_required` (reads keep working). A missing client header counts as level 1.
 * Level 1 = M1 household sync, level 2 = neighbours (Track B) + this handshake.
 * Additive inside level 2 (no bump): live presence (M4), named corners (`corner.name`, `corner.updated`, `SnapshotResponse.corners`)
 * and personal stats per player (`PUT /v1/me/stats`, `SnapshotResponse.myStats`, `JoinResponse.restored`).
 */
export const API_LEVEL = 2;

export const API_HEADERS = {
  /** Response header: the server's API level. */
  serverLevel: 'X-Api-Level',
  /** Request header: the API level the app was built for. */
  clientLevel: 'X-Client-Api-Level',
} as const;

/** Body of `GET /healthz`. */
export interface HealthzResponse {
  ok: true;
  apiLevel: number;
}

export const API_PATHS = {
  healthz: '/healthz',
  join: '/v1/join',
  snapshot: '/v1/snapshot',
  walks: '/v1/walks', // POST upload; GET /v1/walks/:id fetches one full route
  commands: '/v1/commands',
  events: '/v1/events',
  nearby: '/v1/nearby',
  gifts: '/v1/gifts', // GET list; POST /v1/gifts/:id/open (see giftOpenPath)
  coopWeek: '/v1/coop/week',
  import: '/v1/households/import',
  logs: '/v1/logs', // POST only: device diagnostics; read via the operator CLI, never over HTTP
  meStats: '/v1/me/stats', // PUT: the caller's personal stats + achievements (monotonic merge); never shown to other members
  presence: '/v1/presence', // POST heartbeat of a walk in progress; GET the other household members' walks in progress (long-poll)
} as const;

export const giftOpenPath = (giftId: string) => `/v1/gifts/${encodeURIComponent(giftId)}/open`;

export const API_LIMITS = {
  /** Max GPS fixes in one uploaded walk. */
  maxLocationsPerWalk: 20000,
  /** Long-poll ceiling for GET /v1/events?wait= (seconds). */
  maxEventWaitSeconds: 25,
  /** Max events returned by one GET /v1/events call. */
  maxEventsPerPull: 100,
  /** Walks may start at most this far in the future (clock skew allowance). */
  maxWalkFutureSkewMs: 5 * 60 * 1000,
  /** Walks older than this are rejected (reason `too-old`). */
  maxWalkAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxDisplayNameLength: 40,
  /** `player.rename` (and the app's name fields): trimmed length 1..this. */
  maxRenameLength: 24,
  /** `corner.name`: trimmed length 1..this ("Unsere Ecken"). */
  maxCornerNameLength: 24,
  maxDogNameLength: 40,
  /** Founding import ceilings (body limit 5 MiB). */
  maxImportWalks: 2000,
  maxImportCells: 100000,
  maxImportTerritories: 500,
  /** Device log shipping: entries per batch, serialized size per entry (bytes) and the per-device daily row cap. */
  maxLogEntriesPerBatch: 200,
  maxLogEntryBytes: 2048,
  maxLogRowsPerDayPerDevice: 6000,
  /** Live presence: points kept per walk (the server simplifies down to this), points in one heartbeat, minimum gap between heartbeats per device. */
  maxPresencePoints: 400,
  maxPresencePointsPerBeat: 400,
  presenceMinIntervalMs: 10_000,
  /** Personal stats: achievements in one PUT, and the most the server keeps per player (unknown ids from newer apps included). */
  maxAchievementsPerPut: 100,
  maxAchievementsStored: 200,
  /** Personal stats: how often the app uploads at most (also on foreground). */
  statsUploadMinIntervalMs: 60_000,
} as const;

// ------------------------------------------------------------------ errors

/** Machine-readable error codes. `unauthorized` is the single uniform 401 body. */
export type ApiErrorCode =
  | 'upgrade_required' // 426: mutating request from an app older than the server's MIN_CLIENT_API_LEVEL
  | 'unauthorized' // 401: missing/unknown/revoked token, and every unknown path without a token
  | 'invalid_invite' // 403: join refused (unknown, expired, used or household full: deliberately indistinguishable)
  | 'bad_request' // 400: schema validation failed
  | 'walk_rejected' // 422: see WalkRejectedReason
  | 'import_not_allowed' // 409: household already has walks/progress or was seeded by a different importId
  | 'client_id_reuse' // 409: same clientId used for a different command
  | 'daily_cap' // 429: per-household write cap reached
  | 'rate_limited' // 429
  | 'not_found' // 404: only for authenticated requests on a known resource
  | 'payload_too_large' // 413
  | 'unsupported_media_type' // 415
  | 'internal'; // 500

export interface ApiError {
  error: ApiErrorCode;
  /** Present for walk_rejected. */
  reason?: WalkRejectedReason;
}

export type WalkRejectedReason =
  | 'start-in-future'
  | 'too-old'
  | 'no-locations'
  | 'unsupported-source'
  /** manual-log: the household already logged BALANCE.freshGround.maxManualLogsPerDay walks today. */
  | 'manual-log-quota';

// ----------------------------------------------------------------- join

export interface JoinRequest {
  /** 8-char invite code from the operator CLI; case-insensitive, spaces/dashes ignored. */
  code: string;
  playerName: string;
  deviceLabel: string;
  /** Must be true: the player has seen what a household shares (players.consented_at). */
  consent: true;
  /** IANA zone; honoured only for the household's very first member. */
  timezone?: string;
}

export interface JoinResponse {
  /** Bearer token, shown exactly once. Store it; the server keeps only a hash. */
  token: string;
  householdId: string;
  householdName: string;
  playerId: string;
  deviceId: string;
  serverTime: number;
  /** Event cursor to start from after loading GET /v1/snapshot. */
  seq: number;
  /**
   * Present when the code was a restore invite (operator `create-invite --for-player`): this device was attached to an
   * EXISTING player, no member joined, nothing is renamed. `playerName` is then that player's stored name.
   */
  restored?: true;
  playerName?: string;
}

// -------------------------------------------------------------- shared shapes

/** Server-authoritative Den state (subset of the app's DenEconomyState; per-device fields are not synced). */
export interface ApiDenState {
  treats: number;
  doghouseLevel: number;
  bakeryLevel: number;
  sniffGardenLevel: number;
  /** Accrual watermark (ms). The client projects passive income from here, using the same pure formulas. */
  lastTickAt: number;
  xp: number;
  level: number;
  territoryIncomeRevealed: boolean;
  /** Increments on every mutation; clients replace local Den state when this is newer. */
  rev: number;
}

export interface ApiCell {
  ix: number;
  iy: number;
  lastRefreshed: number;
  lastTracked: number;
  /** Distinct household-days this cell was walked (+ founding baseline). Client applies max(local, server). */
  visits: number;
  territoryId: string | null;
}

export interface ApiTerritory {
  id: string;
  name: string;
  createdAt: number;
  walksHere: number;
  treatsEarnedHere: number;
}

export interface ApiDog {
  id: string;
  name: string | null;
  appearance: Record<string, unknown>;
  updatedAt: number;
}

/**
 * A named favourite corner ("Unsere Ecken"). `id` is the centre cell of the 3x3 block, `"ix,iy"` (CORNER_ID_PATTERN):
 * both phones detect corners locally and agree on the id, the server only stores the names. Last writer wins.
 */
export interface ApiCorner {
  id: string;
  name: string;
  /** The member who wrote the current name. */
  updatedBy: string;
  updatedAt: number;
}

/** `"ix,iy"` of the block's centre cell (same format as `cellKey`). */
export const CORNER_ID_PATTERN = '^-?[0-9]{1,9},-?[0-9]{1,9}$';

export interface ApiPlayer {
  id: string;
  displayName: string;
  joinedAt: number;
}

/** Walk without its route (routes are fetched via GET /v1/walks/:id). */
export interface ApiWalkMeta {
  id: string;
  playerId: string;
  startTime: number;
  startSource: 'button' | 'manual-log';
  closed: boolean;
  newGroundCellIds: string[];
  treatsEarned: number | null;
  deleted: boolean;
}

export interface ApiWalkFull extends ApiWalkMeta {
  locations: Location[];
}

// --------------------------------------------------------------- snapshot

export interface SnapshotResponse {
  serverTime: number;
  /** Highest event seq included in this snapshot; continue with GET /v1/events?after=seq. */
  seq: number;
  household: { id: string; name: string; timezone: string };
  me: { playerId: string; deviceId: string; displayName: string };
  players: ApiPlayer[];
  dog: ApiDog;
  /** Passive accrual already projected to serverTime (not persisted by reading). */
  den: ApiDenState;
  cells: ApiCell[];
  territories: ApiTerritory[];
  walks: ApiWalkMeta[];
  /** Named corners. Absent from servers that predate "Unsere Ecken"; treat as empty. */
  corners?: ApiCorner[];
  /** The CALLER's own stats (never a partner's). Absent before the first upload and from servers that predate personal stats. */
  myStats?: ApiMyStats;
}

// ----------------------------------------------------------- personal stats

/** Mirrors the app's PersonalStatsState (src/economy/personalStats.ts). Counters only grow; `firstWalkAt` only moves earlier. */
export interface ApiPersonalStats {
  totalWalksClosed: number;
  lifetimeDistanceMeters: number;
  lifetimeTerritoryAreaM2: number;
  biggestTerritoryAreaM2: number;
  longestWalkDistanceM: number;
  totalTreatsEarnedLifetime: number;
  firstWalkAt: number | null;
}

export interface ApiAchievement {
  /** Kept even when this server/app does not know it (a newer app's badge survives). */
  id: string;
  unlockedAt: number;
}

/**
 * `PUT /v1/me/stats` body and response, and `SnapshotResponse.myStats`. The app sends its FULL state; the server merges
 * (max per number, earliest `firstWalkAt` and achievement date, union of ids; `src/sync/statsMerge.ts`) and answers with
 * the merged result. Commutative and idempotent: retries, two phones and out-of-order requests are safe.
 */
export interface ApiMyStats {
  stats: ApiPersonalStats;
  achievements: ApiAchievement[];
}

/** Upper bounds the server accepts per stat (sanity, not game design). */
export const STATS_CAPS: Record<Exclude<keyof ApiPersonalStats, 'firstWalkAt'>, number> = {
  totalWalksClosed: 1e7,
  lifetimeDistanceMeters: 1e10,
  lifetimeTerritoryAreaM2: 1e13,
  biggestTerritoryAreaM2: 1e13,
  longestWalkDistanceM: 1e8,
  totalTreatsEarnedLifetime: 1e13,
};
/** Latest accepted ms timestamp (year ~2286). */
export const MAX_STATS_TIME_MS = 1e13;
/** Achievement ids: lower-case slugs, e.g. `first-steps`. */
export const ACHIEVEMENT_ID_PATTERN = '^[a-z0-9-]{1,40}$';

// ------------------------------------------------------------------ walks

export interface WalkUploadRequest {
  /** Client-generated UUID; the idempotency key. Re-upload returns the stored result. */
  id: string;
  startTime: number;
  /**
   * 'manual-log' = "Log a walk we missed": `locations` must be empty, nothing is painted, the reward
   * is the same flat treats/XP via the shared formulas. Household-wide quota (balanceConfig
   * freshGround.maxManualLogsPerDay, maxRouteRefreshesPerDay) is enforced on the server.
   */
  startSource: 'button' | 'manual-log';
  locations: Location[];
  /**
   * manual-log only: id of a previously tracked walk whose cells get a household-wide freshness
   * refresh (lastRefreshed only, never lastTracked, no new cells) and the manual-log bloom multiplier.
   * Silently ignored when the day's refresh is used up or the walk has no route.
   */
  refreshRouteWalkId?: string;
  /** Optional reverse-geocoded name hint for a territory born by this walk (server falls back to a generic name). */
  territoryNameHint?: string;
}

export interface WalkReward {
  /** True when the walk painted at least MIN_CELLS_FOR_REWARD cells. */
  qualifies: boolean;
  cellsPainted: number;
  newGroundCellCount: number;
  bloomMultiplier: number;
  /** 1-indexed order among today's rewarded walks (household timezone). */
  walkOrderToday: number;
  dailyMultiplier: number;
  treatsEarned: number;
  xpEarned: number;
  leveledUpTo: number | null;
  /** Territory credited with this walk (null when nothing was painted). */
  territoryId: string | null;
  /** Names for the celebration beat; null when no birth/merge happened or it is the very first territory. */
  newTerritoryName: string | null;
  mergedTerritoryNames: [string, string] | null;
  /** manual-log only: the route refresh was applied (counts against the household's daily refresh). */
  routeRefreshed?: boolean;
}

export interface WalkUploadResponse {
  walkId: string;
  /** True when this id was already stored; reward is the original one. */
  duplicate: boolean;
  reward: WalkReward;
  den: ApiDenState;
  serverTime: number;
  seq: number;
}

// ------------------------------------------------------------------ device logs

export interface ApiLogEntry {
  /** ms since epoch on the phone. */
  t: number;
  /** The log tag, e.g. WALK_FINISHED. */
  event: string;
  /** Already redacted by the app (no tokens, codes, backup data or raw locations). */
  payload: Record<string, unknown>;
  /** Foreground/background state at the time ('active' | 'background' | 'inactive' ...). */
  appState: string;
}

/** `deviceSeq` numbers the FIRST entry; entry i is deviceSeq + i. Resending a batch is harmless (idempotent per device and seq). */
export interface LogUploadRequest {
  deviceSeq: number;
  entries: ApiLogEntry[];
}

export interface LogUploadResponse {
  /** Rows newly stored (duplicates and oversized entries are not counted). */
  stored: number;
}

// ------------------------------------------------------------------ live presence (M4 "Alex im Hof")
// Additive inside API level 2. Ephemeral: never part of the events feed, purged hours after the walk. Visible only to
// the OTHER members of the same household, with the full route (no start fuzz inside a household).

export interface PresencePoint {
  lat: number;
  lon: number;
  /** ms since epoch of the GPS fix. */
  t: number;
}

/** `points` = only the fixes since the last accepted heartbeat (the server dedups by `t`). `ended: true` closes the walk's presence. */
export interface PresenceUpdateRequest {
  walkId: string;
  startedAt: number;
  points: PresencePoint[];
  ended?: boolean;
}

export interface PresenceUpdateResponse {
  ok: true;
}

/** One other member's walk in progress. */
export interface PresenceEntry {
  playerId: string;
  name: string;
  walkId: string;
  startedAt: number;
  /** Simplified to at most API_LIMITS.maxPresencePoints. */
  points: PresencePoint[];
  /** Server time of the last heartbeat. */
  updatedAt: number;
}

/**
 * `GET /v1/presence?after=<rev>&wait=<0..25>`. `rev` changes whenever anything about the others' presence changes
 * (a heartbeat, a walk ending). With `after` equal to the current rev and `wait > 0` the call parks until it changes
 * or the wait is over, then answers either way. Without `after` it answers at once.
 */
export interface PresenceResponse {
  rev: number;
  presence: PresenceEntry[];
  serverTime: number;
}

export type WalkGetResponse = ApiWalkFull;

// --------------------------------------------------------------- commands

export type BuildingKey = 'doghouse' | 'bakery' | 'sniffGarden';

export type CommandBody =
  | { kind: 'den.upgrade'; building: BuildingKey }
  /** Applies passive accrual to the stored Den state (the "collect" tap). Always ok. */
  | { kind: 'den.claim' }
  | { kind: 'dog.update'; name?: string | null; appearance?: Record<string, unknown> }
  /**
   * Walks are soft-deleted; the cells they painted STAY (the Range never shrinks, so a delete cannot
   * be used to undo or game the shared map). Emits `walk.deleted`.
   */
  | { kind: 'walk.delete'; walkId: string }
  /** Changes the caller's own display name (trimmed, 1..maxRenameLength). Emits `member.updated`. */
  | { kind: 'player.rename'; name: string }
  /**
   * Names (or renames) a favourite corner for the whole household: trimmed, 1..maxCornerNameLength, last writer
   * wins, no notification. Emits `corner.updated`. Idempotent like every command.
   */
  | { kind: 'corner.name'; cornerId: string; name: string }
  /**
   * Opens a neighbour gift (POST /v1/gifts/:id/open wraps this). First opener wins; a second open is
   * ok with no further credit. The gift's treat sprinkle goes straight into the Den (no reward formulas).
   */
  | { kind: 'gift.open'; giftId: string };

export interface CommandRequest {
  /** Client-generated UUID, the idempotency key. Replay returns the stored result. */
  clientId: string;
  command: CommandBody;
}

export type CommandErrorCode = 'insufficient-treats' | 'max-level' | 'not-found';

export interface CommandResponse {
  clientId: string;
  ok: boolean;
  /** Present when ok is false. Not an HTTP error: roll back optimistic state and show a gentle line. */
  error?: CommandErrorCode;
  /** True when this clientId was seen before and the stored result is returned. */
  replayed: boolean;
  den: ApiDenState;
  dog?: ApiDog;
  serverTime: number;
  seq: number;
}

// ----------------------------------------------------------------- events

export type EventKind =
  | 'walk.added'
  | 'walk.deleted'
  | 'cells.changed'
  | 'territory.changed'
  | 'den.updated'
  | 'dog.updated'
  | 'member.joined'
  | 'member.updated'
  | 'corner.updated'
  // Track B (Nachbarhunde). Payload is a line KEY plus params, never copy; the app renders it via i18n.
  | 'neighbour.sniffed'
  | 'neighbour.gift'
  | 'neighbour.reaction'
  | 'neighbour.invitation'
  | 'coop.progress';

/** i18n keys of the 12 neighbour lines (src/i18n `neighbours.line.*`). */
export const NEIGHBOUR_LINE_KEYS = [
  'neighbours.line.sniffCorner',
  'neighbours.line.stickLeft',
  'neighbours.line.mailboxLaps',
  'neighbours.line.benchRated',
  'neighbours.line.invitation',
  'neighbours.line.followedPath',
  'neighbours.line.coopDone',
  'neighbours.line.collarGift',
  'neighbours.line.wave',
  'neighbours.line.thanksCome',
  'neighbours.line.moonHello',
  'neighbours.line.sockLeft',
] as const;
export type NeighbourLineKey = (typeof NEIGHBOUR_LINE_KEYS)[number];

export interface NeighbourEventPayload {
  /** Proper name of the dog ("Momo"); null for the whole-neighbourhood co-op line. Also available as {bot} in params. */
  botName: string | null;
  /** Opaque bot id (matches NearbyItem.id), null for co-op. */
  botId: string | null;
  line: NeighbourLineKey;
  /** Interpolation values for the line: always `bot`, plus `at` (invitation time "18:00") or `km` (co-op). */
  params: Record<string, string | number>;
  /** neighbour.gift only: the gift to open (GET /v1/gifts). */
  giftId?: string;
  /** neighbour.reaction only: cells with paw prints (presentation only, capped). */
  pawCells?: Array<{ ix: number; iy: number }>;
}

export interface EventPayloads {
  'walk.added': { walk: ApiWalkMeta; cellsPainted: number };
  'walk.deleted': { walkId: string };
  'cells.changed': { cells: ApiCell[]; reassigned: Array<{ from: string; to: string }> };
  'territory.changed': { upserted: ApiTerritory[]; removedIds: string[] };
  'den.updated': { den: ApiDenState };
  'dog.updated': { dog: ApiDog };
  'member.joined': { player: ApiPlayer };
  'member.updated': { player: ApiPlayer };
  'corner.updated': { corner: ApiCorner };
  'neighbour.sniffed': NeighbourEventPayload;
  'neighbour.gift': NeighbourEventPayload;
  'neighbour.reaction': NeighbourEventPayload;
  'neighbour.invitation': NeighbourEventPayload;
  'coop.progress': NeighbourEventPayload;
}

export type ApiEvent = {
  [K in EventKind]: {
    seq: number;
    kind: K;
    actorPlayerId: string | null;
    createdAt: number;
    payload: EventPayloads[K];
  };
}[EventKind];

/** GET /v1/events?after=<seq>&wait=<seconds 0..25>&limit=<1..100> */
export interface EventsResponse {
  events: ApiEvent[];
  /** Highest seq the client may advance its cursor to (== last event's seq, or `after` when empty). */
  cursor: number;
  hasMore: boolean;
  serverTime: number;
}

// ----------------------------------------------------------------- nearby

/**
 * GET /v1/nearby?radiusM=<1..10000, default 5000>&include=cells. `[]` while NEIGHBOURS_ENABLED is off or no
 * neighbours exist yet. Bots are simulated: `generated` is always true and the card must say so.
 */
export interface NearbyItem {
  /** Opaque (the bot household id). */
  id: string;
  kind: 'bot';
  generated: true;
  /** Archetype slug: momo, pfote, bruno, keks, lotte, nebel (art/trait lookup). */
  archetype: string;
  dogName: string;
  /** Our own appearance enums (src/buddy/buddyAppearance.ts). */
  appearance: Record<string, unknown>;
  /** i18n key of the one-line trait, e.g. `neighbours.dog.momo.trait`. */
  traitKey: string;
  /** Coarse distance band: `near` (<1 km), `around` (<2 km), `further`. */
  areaLabel: string;
  /** `today` | `yesterday` | `this-week` | `earlier` | `none`. */
  lastActiveBucket: string;
  /** Distinct days this neighbour was met (plain state; never a comparison number). */
  metCount: number;
  /** Synthetic dotted Range, only with include=cells; capped (NEIGHBOUR_CONFIG.nearby.maxCellsPerBot). */
  rangeCells?: Array<{ ix: number; iy: number }>;
}

export interface NearbyResponse {
  items: NearbyItem[];
}

// ------------------------------------------------------------ gifts / co-op

export interface ApiGift {
  id: string;
  botId: string;
  botName: string;
  /** Cosmetic id from the finite catalog (collars, sticks, yard doodads), or null (sprinkle only). */
  cosmeticId: string | null;
  /** Treats credited when opened (5% of an average walk), or null. */
  sprinkleTreats: number | null;
  createdAt: number;
  /** null = still wrapped. Gifts never expire. */
  openedAt: number | null;
}

/** GET /v1/gifts: newest first. Opened gifts double as the household's cosmetic inventory. */
export interface GiftsResponse {
  gifts: ApiGift[];
}

/**
 * GET /v1/coop/week: the Viertel-Runde. Deliberately one ratio and one total, no human/bot split
 * (no comparison numbers), and no loss state.
 */
export interface CoopWeekResponse {
  /** False before the first Viertel-Runde (W3) or while neighbours are off. */
  active: boolean;
  /** Monday of the ISO week in the household timezone, YYYY-MM-DD. */
  weekStart: string | null;
  goalKm: number;
  totalKm: number;
  /** 0..1 */
  ratio: number;
  completed: boolean;
  /** Yard decoration earned this week, if completed. */
  rewardId: string | null;
  /** Every yard decoration the household has earned (the Den yard shows them). */
  yardDecorations: string[];
}

// ----------------------------------------------------------- founding import

/**
 * POST /v1/households/import: the first device seeds the household with its existing local progress.
 * Allowed only while the household has no walks and the Den was never changed; idempotent by
 * `importId` (same id again = 200 with the same snapshot, `replayed: true`; any other id = 409
 * `import_not_allowed`). The app maps BackupFile.data onto this explicitly (settings, feedback,
 * notification and personal stats are NOT sent):
 *   walks        <- data.walks (id, startTime, locations, closed, startSource, newGroundCellIds, treatsEarned)
 *   cells        <- data.homeRange.cells
 *   territories  <- data.territories
 *   den          <- data.denEconomy (the 7 listed fields)
 *   dog          <- { name: data.denEconomy.dogName, appearance: data.buddyAppearance.appearance }
 * Imported walks are stored as-is (no reward recompute, no cell_days); cell `visits` become the
 * baseline for future distinct-day counting. The seeded Den is the authoritative start state.
 */
export interface ImportWalk {
  id: string;
  startTime: number;
  startSource: 'button' | 'manual-log';
  closed: boolean;
  locations: Location[];
  newGroundCellIds?: string[];
  treatsEarned?: number;
}

export interface ImportDen {
  treats: number;
  doghouseLevel: number;
  bakeryLevel: number;
  sniffGardenLevel: number;
  lastTickAt: number;
  xp: number;
  level: number;
}

export interface ImportRequest {
  /** Client-generated UUID, the idempotency key. */
  importId: string;
  walks: ImportWalk[];
  cells: ApiCell[];
  territories: ApiTerritory[];
  den: ImportDen;
  dog: { name: string | null; appearance: Record<string, unknown> };
}

export interface ImportResponse extends SnapshotResponse {
  replayed: boolean;
}
