// Postgres schema (design Decision 8). Every table carries household_id and every query filters on it.
// All timestamps are bigint ms-epoch numbers (same unit as the app) except created_at-style audit
// columns, which are timestamptz.
import {
  bigint,
  bigserial,
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const ms = (name: string) => bigint(name, { mode: 'number' });

/** gzip-compressed street tile (Track B). Buffer in, Buffer out on both postgres.js and PGlite. */
const bytea = customType<{ data: Buffer; driverData: Uint8Array }>({
  dataType: () => 'bytea',
  toDriver: (value) => value,
  fromDriver: (value) => Buffer.from(value),
});

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Europe/Berlin'),
  discoverable: boolean('discoverable').notNull().default(false),
  foundedImportDone: boolean('founded_import_done').notNull().default(true),
  importId: text('import_id'),
  /** Track B: a simulated neighbour household. Nobody can authenticate as one (no players, no devices). */
  isBot: boolean('is_bot').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    consentedAt: timestamp('consented_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => [index('players_household_idx').on(t.householdId)]
);

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('devices_token_hash_uq').on(t.tokenHash)]
);

export const inviteCodes = pgTable(
  'invite_codes',
  {
    codeHash: text('code_hash').primaryKey(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedByPlayerId: uuid('used_by_player_id'),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('invite_codes_household_idx').on(t.householdId)]
);

export const dogs = pgTable(
  'dogs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    name: text('name'),
    appearance: jsonb('appearance').notNull().default({}),
    updatedAt: ms('updated_at').notNull(),
  },
  (t) => [index('dogs_household_idx').on(t.householdId)]
);

// Append-only: rows are never updated except deleted_at (soft delete). Cells are never un-painted.
export const walks = pgTable(
  'walks',
  {
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    id: text('id').notNull(), // client UUID, the idempotency key
    // null for generated (bot) walks
    playerId: uuid('player_id').references(() => players.id),
    startTime: ms('start_time').notNull(),
    startSource: text('start_source').notNull(),
    route: jsonb('route').notNull(),
    closed: boolean('closed').notNull(),
    newGroundCellIds: jsonb('new_ground_cell_ids').notNull().default([]),
    treatsEarned: integer('treats_earned'),
    reward: jsonb('reward').notNull(), // stored result, returned verbatim on re-upload
    /** Track B: written by the neighbour generator. Every human-facing query also filters on this. */
    generated: boolean('generated').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.id] }), index('walks_household_start_idx').on(t.householdId, t.startTime)]
);

export const cells = pgTable(
  'cells',
  {
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    ix: integer('ix').notNull(),
    iy: integer('iy').notNull(),
    lastRefreshed: ms('last_refreshed').notNull(),
    lastTracked: ms('last_tracked').notNull(),
    baselineVisits: integer('baseline_visits').notNull().default(0),
    visits: integer('visits').notNull().default(0), // baseline_visits + count(cell_days)
    territoryId: text('territory_id'),
    /** Track B: redundant with households.is_bot on purpose (second guard in human-facing queries). */
    generated: boolean('generated').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.ix, t.iy] }), index('cells_territory_idx').on(t.householdId, t.territoryId)]
);

// Day-set behind cells.visits (design Decision 3): union of days is commutative and idempotent.
export const cellDays = pgTable(
  'cell_days',
  {
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    ix: integer('ix').notNull(),
    iy: integer('iy').notNull(),
    day: text('day').notNull(), // YYYY-MM-DD in the household timezone
  },
  (t) => [primaryKey({ columns: [t.householdId, t.ix, t.iy, t.day] })]
);

export const territories = pgTable(
  'territories',
  {
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    id: text('id').notNull(), // t<15-digit-ms>-<rand>, same format as the app
    name: text('name').notNull(),
    createdAt: ms('created_at').notNull(),
    walksHere: integer('walks_here').notNull().default(0),
    treatsEarnedHere: integer('treats_earned_here').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.id] })]
);

export const denState = pgTable('den_state', {
  householdId: uuid('household_id').primaryKey().references(() => households.id, { onDelete: 'cascade' }),
  treats: doublePrecision('treats').notNull(),
  doghouseLevel: integer('doghouse_level').notNull().default(1),
  bakeryLevel: integer('bakery_level').notNull().default(1),
  sniffGardenLevel: integer('sniff_garden_level').notNull().default(1),
  lastTickAt: ms('last_tick_at').notNull(),
  xp: doublePrecision('xp').notNull().default(0),
  level: integer('level').notNull().default(1),
  territoryIncomeRevealed: boolean('territory_income_revealed').notNull().default(false),
  rev: integer('rev').notNull().default(0),
  updatedAt: ms('updated_at').notNull(),
});

// Idempotent command log (design: command_log). Replay returns `result`, never re-executes.
export const economyCommands = pgTable(
  'economy_commands',
  {
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    kind: text('kind').notNull(),
    playerId: uuid('player_id').notNull(),
    request: jsonb('request').notNull(),
    result: jsonb('result').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.clientId] })]
);

// Change feed and Doorstep feed (design Decision 2).
export const events = pgTable(
  'events',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    actorPlayerId: uuid('actor_player_id'),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('events_household_seq_idx').on(t.householdId, t.seq)]
);

export const bannedIps = pgTable('banned_ips', {
  ip: text('ip').primaryKey(),
  until: timestamp('until', { withTimezone: true }).notNull(),
  strikes: integer('strikes').notNull().default(1),
  reason: text('reason').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Device diagnostics shipped by the app (log shipping). Read only through the operator CLI (`cli logs`).
 * Retention: rows older than 14 days (received_at) are deleted by the hourly retention job.
 * `device_seq` numbers entries per device; the unique index makes resending a batch idempotent.
 */
export const deviceLogs = pgTable(
  'device_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    deviceSeq: ms('device_seq').notNull(),
    t: ms('t').notNull(),
    event: text('event').notNull(),
    payload: jsonb('payload').notNull(),
    appState: text('app_state').notNull(),
    receivedAt: ms('received_at').notNull(),
  },
  (t) => [
    uniqueIndex('device_logs_device_seq_uq').on(t.deviceId, t.deviceSeq),
    index('device_logs_household_t_idx').on(t.householdId, t.t),
    index('device_logs_received_idx').on(t.receivedAt),
  ]
);

/**
 * Live presence of a walk in progress (M4 "Alex im Hof"). Ephemeral on purpose: not part of the events feed,
 * purged hourly 6 h after the last heartbeat (and gone with the household/player). One row per (player, walk);
 * `points` is the simplified route so far (at most API_LIMITS.maxPresencePoints). Only the OTHER members of the
 * same household ever read it.
 */
export const walkPresence = pgTable(
  'walk_presence',
  {
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    walkId: text('walk_id').notNull(),
    startedAt: ms('started_at').notNull(),
    updatedAt: ms('updated_at').notNull(),
    points: jsonb('points').notNull().default([]),
    endedAt: ms('ended_at'),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.walkId] }),
    index('walk_presence_household_idx').on(t.householdId, t.endedAt),
    index('walk_presence_updated_idx').on(t.updatedAt),
  ]
);

/**
 * "Unsere Ecken": the household's names for favourite corners. Corners themselves are detected on the phones
 * (deterministic id = centre cell "ix,iy"); the server only keeps the name, last writer wins. No FK on the
 * player columns on purpose (the name outlives a member who left).
 */
export const corners = pgTable(
  'corners',
  {
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    cornerId: text('corner_id').notNull(),
    name: text('name').notNull(),
    createdBy: uuid('created_by').notNull(),
    updatedBy: uuid('updated_by').notNull(),
    createdAt: ms('created_at').notNull(),
    updatedAt: ms('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.cornerId] })]
);

// ------------------------------------------------------------------ Track B: Nachbarhunde

/** One row per bot household (design Decision 17). `household_id` is the BOT household; the human one is `host_household_id`. */
export const botProfiles = pgTable(
  'bot_profiles',
  {
    householdId: uuid('household_id').primaryKey().references(() => households.id, { onDelete: 'cascade' }),
    hostHouseholdId: uuid('host_household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    archetype: text('archetype').notNull(), // momo, pfote, bruno, keks, lotte, nebel
    name: text('name').notNull(),
    appearance: jsonb('appearance').notNull(), // our enum ids (src/buddy/buddyAppearance.ts)
    personality: text('personality').notNull(), // i18n trait key
    rhythm: jsonb('rhythm').notNull(), // walk slots, speed (from archetypes.ts at creation time)
    quirk: text('quirk').notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    homeLat: doublePrecision('home_lat').notNull(), // synthetic home, never sent to any client
    homeLng: doublePrecision('home_lng').notNull(),
    introducedAt: ms('introduced_at').notNull(),
    metCount: integer('met_count').notNull().default(0),
    exclusiveGiftSentAt: ms('exclusive_gift_sent_at'),
  },
  (t) => [uniqueIndex('bot_profiles_host_archetype_uq').on(t.hostHouseholdId, t.archetype)]
);

export const botSchedules = pgTable(
  'bot_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }), // the bot
    hostHouseholdId: uuid('host_household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    day: text('day').notNull(), // host-timezone date
    slot: text('slot').notNull(),
    plannedStart: ms('planned_start').notNull(),
    targetM: integer('target_m').notNull(),
    /** Reaction walks must pass near this point (lat/lng). */
    via: jsonb('via'),
    walkId: text('walk_id'),
    generator: text('generator'), // 'osm' | 'offset'
    distanceM: integer('distance_m'),
    status: text('status').notNull().default('planned'), // planned | done | skipped
  },
  (t) => [
    uniqueIndex('bot_schedules_bot_day_slot_uq').on(t.householdId, t.day, t.slot),
    index('bot_schedules_host_day_idx').on(t.hostHouseholdId, t.day),
  ]
);

/** Global cache of Overpass street tiles (coarse grid). Not tenant data: shared across households, never exported. */
export const streetTiles = pgTable('street_tiles', {
  tileId: text('tile_id').primaryKey(),
  fetchedAt: ms('fetched_at').notNull(),
  graph: bytea('graph'),
  status: text('status').notNull(), // ok | empty | failed
});

export const neighbourEvents = pgTable(
  'neighbour_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostHouseholdId: uuid('host_household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    botHouseholdId: uuid('bot_household_id').references(() => households.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // an EventKind
    lineKey: text('line_key').notNull(),
    params: jsonb('params').notNull(),
    day: text('day').notNull(), // host-timezone day of due_at (cap bucket)
    /** Idempotency within a day, e.g. 'daily-1', 'reaction-<walkId>', 'coop'. */
    slotKey: text('slot_key').notNull(),
    dueAt: ms('due_at').notNull(),
    emittedSeq: bigint('emitted_seq', { mode: 'number' }),
  },
  (t) => [
    uniqueIndex('neighbour_events_host_day_slot_uq').on(t.hostHouseholdId, t.day, t.slotKey),
    index('neighbour_events_host_due_idx').on(t.hostHouseholdId, t.dueAt),
  ]
);

export const gifts = pgTable(
  'gifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostHouseholdId: uuid('host_household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    botHouseholdId: uuid('bot_household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    cosmeticId: text('cosmetic_id'),
    sprinkleTreats: integer('sprinkle_treats'),
    day: text('day').notNull(),
    createdAt: ms('created_at').notNull(),
    openedAt: ms('opened_at'),
    openedByPlayerId: uuid('opened_by_player_id'),
  },
  (t) => [index('gifts_host_idx').on(t.hostHouseholdId, t.createdAt)]
);

export const coopWeeks = pgTable(
  'coop_weeks',
  {
    hostHouseholdId: uuid('host_household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    weekStart: text('week_start').notNull(), // Monday, YYYY-MM-DD in the host timezone
    goalKm: doublePrecision('goal_km').notNull(),
    plannedBotKm: doublePrecision('planned_bot_km').notNull(), // already capped (counts toward the goal)
    botKm: doublePrecision('bot_km').notNull().default(0),
    humanKm: doublePrecision('human_km').notNull().default(0),
    carriedKm: doublePrecision('carried_km').notNull().default(0),
    completedAt: ms('completed_at'),
    rewardId: text('reward_id'),
    announcedAt: ms('announced_at'),
  },
  (t) => [primaryKey({ columns: [t.hostHouseholdId, t.weekStart] })]
);
