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

export const API_PATHS = {
  healthz: '/healthz',
  join: '/v1/join',
  snapshot: '/v1/snapshot',
  walks: '/v1/walks', // POST upload; GET /v1/walks/:id fetches one full route
  commands: '/v1/commands',
  events: '/v1/events',
  nearby: '/v1/nearby',
  import: '/v1/households/import',
} as const;

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
  maxDogNameLength: 40,
  /** Founding import ceilings (body limit 5 MiB). */
  maxImportWalks: 2000,
  maxImportCells: 100000,
  maxImportTerritories: 500,
} as const;

// ------------------------------------------------------------------ errors

/** Machine-readable error codes. `unauthorized` is the single uniform 401 body. */
export type ApiErrorCode =
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
}

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
  | { kind: 'player.rename'; name: string };

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
  | 'member.updated';

export interface EventPayloads {
  'walk.added': { walk: ApiWalkMeta; cellsPainted: number };
  'walk.deleted': { walkId: string };
  'cells.changed': { cells: ApiCell[]; reassigned: Array<{ from: string; to: string }> };
  'territory.changed': { upserted: ApiTerritory[]; removedIds: string[] };
  'den.updated': { den: ApiDenState };
  'dog.updated': { dog: ApiDog };
  'member.joined': { player: ApiPlayer };
  'member.updated': { player: ApiPlayer };
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

/** Always `[]` in M1; item shape is fixed now so Track B adds no breaking change. */
export interface NearbyItem {
  id: string;
  kind: 'bot';
  dogName: string;
  appearance: Record<string, unknown>;
  traitKey: string;
  areaLabel: string;
  lastActiveBucket: string;
  metCount: number;
  rangeCells?: Array<{ ix: number; iy: number }>;
}

export interface NearbyResponse {
  items: NearbyItem[];
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
