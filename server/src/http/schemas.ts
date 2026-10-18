// Request validation (TypeBox -> JSON Schema for Fastify/ajv). Unknown properties are rejected
// (additionalProperties:false + ajv removeAdditional off, see app.ts). Each schema is checked at
// compile time against the shared contract in src/sync/apiContract.ts: if they drift, tsc fails.
import { Type, type Static } from '@sinclair/typebox';
import { NEIGHBOUR_CONFIG } from '@game/economy/neighbourConfig';
import { ACHIEVEMENT_ID_PATTERN, API_LIMITS, CORNER_ID_PATTERN, MAX_STATS_TIME_MS, STATS_CAPS } from '@game/sync/apiContract';
import type { ApiMyStats, CommandRequest, ImportRequest, JoinRequest, LogUploadRequest, PresenceUpdateRequest, WalkUploadRequest } from '@game/sync/apiContract';

const Str = (min: number, max: number) => Type.String({ minLength: min, maxLength: max });
const Id = Type.String({ minLength: 8, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' });

export const JoinSchema = Type.Object(
  {
    code: Str(8, 16),
    playerName: Str(1, API_LIMITS.maxDisplayNameLength),
    deviceLabel: Str(1, 60),
    consent: Type.Literal(true),
    timezone: Type.Optional(Str(1, 64)),
  },
  { additionalProperties: false }
);

const LocationSchema = Type.Object(
  {
    latitude: Type.Number({ minimum: -90, maximum: 90 }),
    longitude: Type.Number({ minimum: -180, maximum: 180 }),
    timestamp: Type.Number({ minimum: 0 }),
    accuracy: Type.Number({ minimum: 0, maximum: 100000 }),
  },
  { additionalProperties: false }
);

export const WalkUploadSchema = Type.Object(
  {
    id: Id,
    startTime: Type.Number({ minimum: 0 }),
    startSource: Type.Union([Type.Literal('button'), Type.Literal('manual-log')]),
    locations: Type.Array(LocationSchema, { maxItems: API_LIMITS.maxLocationsPerWalk }),
    refreshRouteWalkId: Type.Optional(Id),
    territoryNameHint: Type.Optional(Str(0, 80)),
  },
  { additionalProperties: false }
);

const Building = Type.Union([Type.Literal('doghouse'), Type.Literal('bakery'), Type.Literal('sniffGarden')]);

export const CommandSchema = Type.Object(
  {
    clientId: Id,
    command: Type.Union([
      Type.Object({ kind: Type.Literal('den.upgrade'), building: Building }, { additionalProperties: false }),
      Type.Object({ kind: Type.Literal('den.claim') }, { additionalProperties: false }),
      Type.Object(
        {
          kind: Type.Literal('dog.update'),
          name: Type.Optional(Type.Union([Str(1, API_LIMITS.maxDogNameLength), Type.Null()])),
          appearance: Type.Optional(Type.Record(Type.String({ maxLength: 40 }), Type.Unknown())),
        },
        { additionalProperties: false }
      ),
      Type.Object({ kind: Type.Literal('walk.delete'), walkId: Id }, { additionalProperties: false }),
      Type.Object({ kind: Type.Literal('gift.open'), giftId: Id }, { additionalProperties: false }),
      Type.Object(
        // pattern: at least one non-space character, so a whitespace-only name is a 400, not an empty name
        { kind: Type.Literal('player.rename'), name: Type.String({ minLength: 1, maxLength: API_LIMITS.maxRenameLength, pattern: '\\S' }) },
        { additionalProperties: false }
      ),
      Type.Object(
        {
          kind: Type.Literal('corner.name'),
          cornerId: Type.String({ minLength: 3, maxLength: 20, pattern: CORNER_ID_PATTERN }),
          // No control characters: a NUL cannot be stored in Postgres text and would be a 500, not a 400.
          name: Type.String({ minLength: 1, maxLength: API_LIMITS.maxCornerNameLength, pattern: '^(?=.*\\S)[^\\u0000-\\u001F\\u007F]+$' }),
        },
        { additionalProperties: false }
      ),
    ]),
  },
  { additionalProperties: false }
);

export const EventsQuerySchema = Type.Object(
  {
    after: Type.Integer({ minimum: 0, default: 0 }),
    wait: Type.Integer({ minimum: 0, maximum: API_LIMITS.maxEventWaitSeconds, default: 0 }),
    limit: Type.Integer({ minimum: 1, maximum: API_LIMITS.maxEventsPerPull, default: 50 }),
  },
  { additionalProperties: false }
);

export const PresenceSchema = Type.Object(
  {
    walkId: Id,
    startedAt: Type.Number({ minimum: 0 }),
    points: Type.Array(
      Type.Object(
        { lat: Type.Number({ minimum: -90, maximum: 90 }), lon: Type.Number({ minimum: -180, maximum: 180 }), t: Type.Number({ minimum: 0 }) },
        { additionalProperties: false }
      ),
      { maxItems: API_LIMITS.maxPresencePointsPerBeat }
    ),
    ended: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false }
);

export const PresenceQuerySchema = Type.Object(
  {
    after: Type.Optional(Type.Integer({ minimum: 0 })),
    wait: Type.Integer({ minimum: 0, maximum: API_LIMITS.maxEventWaitSeconds, default: 0 }),
  },
  { additionalProperties: false }
);

export const NearbyQuerySchema = Type.Object(
  {
    radiusM: Type.Optional(Type.Integer({ minimum: 1, maximum: NEIGHBOUR_CONFIG.nearby.maxRadiusM })),
    include: Type.Optional(Type.Literal('cells')),
  },
  { additionalProperties: false }
);

export const GiftParamsSchema = Type.Object({ id: Id }, { additionalProperties: false });

export const GiftOpenBodySchema = Type.Object({ clientId: Id }, { additionalProperties: false });

export const WalkParamsSchema = Type.Object({ id: Id }, { additionalProperties: false });

const Int = (min = -1_000_000_000, max = 1_000_000_000) => Type.Integer({ minimum: min, maximum: max });
const Level = Type.Integer({ minimum: 1, maximum: 100 });

export const ImportSchema = Type.Object(
  {
    importId: Id,
    walks: Type.Array(
      Type.Object(
        {
          id: Id,
          startTime: Type.Number({ minimum: 0 }),
          startSource: Type.Union([Type.Literal('button'), Type.Literal('manual-log')]),
          closed: Type.Boolean(),
          locations: Type.Array(LocationSchema, { maxItems: API_LIMITS.maxLocationsPerWalk }),
          newGroundCellIds: Type.Optional(Type.Array(Type.String({ maxLength: 24 }), { maxItems: 20000 })),
          treatsEarned: Type.Optional(Type.Integer({ minimum: 0, maximum: 1_000_000 })),
        },
        { additionalProperties: false }
      ),
      { maxItems: API_LIMITS.maxImportWalks }
    ),
    cells: Type.Array(
      Type.Object(
        {
          ix: Int(),
          iy: Int(),
          lastRefreshed: Type.Number({ minimum: 0 }),
          lastTracked: Type.Number({ minimum: 0 }),
          visits: Type.Integer({ minimum: 0, maximum: 100000 }),
          territoryId: Type.Union([Str(1, 40), Type.Null()]),
        },
        { additionalProperties: false }
      ),
      { maxItems: API_LIMITS.maxImportCells }
    ),
    territories: Type.Array(
      Type.Object(
        {
          id: Str(1, 40),
          name: Str(1, 80),
          createdAt: Type.Number({ minimum: 0 }),
          walksHere: Type.Integer({ minimum: 0, maximum: 1_000_000 }),
          treatsEarnedHere: Type.Integer({ minimum: 0, maximum: 1_000_000_000 }),
        },
        { additionalProperties: false }
      ),
      { maxItems: API_LIMITS.maxImportTerritories }
    ),
    den: Type.Object(
      {
        treats: Type.Number({ minimum: 0, maximum: 1e12 }),
        doghouseLevel: Level,
        bakeryLevel: Level,
        sniffGardenLevel: Level,
        lastTickAt: Type.Number({ minimum: 0 }),
        xp: Type.Number({ minimum: 0, maximum: 1e12 }),
        level: Level,
      },
      { additionalProperties: false }
    ),
    dog: Type.Object(
      {
        name: Type.Union([Str(1, API_LIMITS.maxDogNameLength), Type.Null()]),
        appearance: Type.Record(Type.String({ maxLength: 40 }), Type.Unknown()),
      },
      { additionalProperties: false }
    ),
  },
  { additionalProperties: false }
);

export const LogUploadSchema = Type.Object(
  {
    deviceSeq: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1_000_000 }),
    entries: Type.Array(
      Type.Object(
        {
          t: Type.Number({ minimum: 0 }),
          event: Type.String({ minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9_.:-]+$' }),
          payload: Type.Record(Type.String({ maxLength: 80 }), Type.Unknown()),
          appState: Str(1, 20),
        },
        { additionalProperties: false }
      ),
      { minItems: 1, maxItems: API_LIMITS.maxLogEntriesPerBatch }
    ),
  },
  { additionalProperties: false }
);

const StatNumber = (max: number) => Type.Number({ minimum: 0, maximum: max });
const StatTime = Type.Number({ minimum: 0, maximum: MAX_STATS_TIME_MS });

/** PUT /v1/me/stats: the full state. Unknown stat keys are a 400 (a new stat is a server change first); unknown achievement ids are fine. */
export const MyStatsSchema = Type.Object(
  {
    stats: Type.Object(
      {
        totalWalksClosed: StatNumber(STATS_CAPS.totalWalksClosed),
        lifetimeDistanceMeters: StatNumber(STATS_CAPS.lifetimeDistanceMeters),
        lifetimeTerritoryAreaM2: StatNumber(STATS_CAPS.lifetimeTerritoryAreaM2),
        biggestTerritoryAreaM2: StatNumber(STATS_CAPS.biggestTerritoryAreaM2),
        longestWalkDistanceM: StatNumber(STATS_CAPS.longestWalkDistanceM),
        totalTreatsEarnedLifetime: StatNumber(STATS_CAPS.totalTreatsEarnedLifetime),
        // Null first: with ajv coerceTypes a null would be coerced to 0 by the number branch.
        firstWalkAt: Type.Union([Type.Null(), StatTime]),
      },
      { additionalProperties: false }
    ),
    achievements: Type.Array(
      Type.Object({ id: Type.String({ pattern: ACHIEVEMENT_ID_PATTERN }), unlockedAt: StatTime }, { additionalProperties: false }),
      { maxItems: API_LIMITS.maxAchievementsPerPut }
    ),
  },
  { additionalProperties: false }
);

// ---- compile-time drift checks (assignable both ways)
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _join: Same<Static<typeof JoinSchema>, JoinRequest> = true;
const _walk: Same<Static<typeof WalkUploadSchema>, WalkUploadRequest> = true;
const _cmd: Same<Static<typeof CommandSchema>, CommandRequest> = true;
const _import: Same<Static<typeof ImportSchema>, ImportRequest> = true;
const _logs: Same<Static<typeof LogUploadSchema>, LogUploadRequest> = true;
const _presence: Same<Static<typeof PresenceSchema>, PresenceUpdateRequest> = true;
const _myStats: Same<Static<typeof MyStatsSchema>, ApiMyStats> = true;
void [_join, _walk, _cmd, _import, _logs, _presence, _myStats];
