// Postgres schema (design Decision 8). Every table carries household_id and every query filters on it.
// All timestamps are bigint ms-epoch numbers (same unit as the app) except created_at-style audit
// columns, which are timestamptz.
import {
  bigint,
  bigserial,
  boolean,
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

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Europe/Berlin'),
  discoverable: boolean('discoverable').notNull().default(false),
  foundedImportDone: boolean('founded_import_done').notNull().default(true),
  importId: text('import_id'),
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
    playerId: uuid('player_id').notNull().references(() => players.id),
    startTime: ms('start_time').notNull(),
    startSource: text('start_source').notNull(),
    route: jsonb('route').notNull(),
    closed: boolean('closed').notNull(),
    newGroundCellIds: jsonb('new_ground_cell_ids').notNull().default([]),
    treatsEarned: integer('treats_earned'),
    reward: jsonb('reward').notNull(), // stored result, returned verbatim on re-upload
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
