import * as SQLite from 'expo-sqlite';

import {
  defaultNotificationBookkeepingState,
  NotificationBookkeepingState,
  TimeOfDayBucket,
} from '../notifications/notificationDecision';
import { NotificationRepository } from './NotificationRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';
const SINGLETON_ID = 'singleton';

interface NotificationBookkeepingRow {
  id: string;
  overflowSurfaced: number;
  learnedTimeOfDayBucket: string | null;
  walkReminderEnabled: number;
  walkReminderHour: number | null;
  walkReminderMinute: number | null;
  walkReminderConsecutiveIgnores: number;
  walkReminderPendingDate: string | null;
  walkReminderFiredCount: number;
  walkReminderFollowedCount: number;
  walkReminderExperimentStartedAt: number | null;
}

function rowToState(row: NotificationBookkeepingRow): NotificationBookkeepingState {
  return {
    overflowSurfaced: row.overflowSurfaced === 1,
    learnedTimeOfDayBucket: (row.learnedTimeOfDayBucket as TimeOfDayBucket | null) ?? null,
    walkReminderEnabled: row.walkReminderEnabled === 1,
    walkReminderHour: row.walkReminderHour,
    walkReminderMinute: row.walkReminderMinute,
    walkReminderConsecutiveIgnores: row.walkReminderConsecutiveIgnores,
    walkReminderPendingDate: row.walkReminderPendingDate,
    walkReminderFiredCount: row.walkReminderFiredCount,
    walkReminderFollowedCount: row.walkReminderFollowedCount,
    walkReminderExperimentStartedAt: row.walkReminderExperimentStartedAt,
  };
}

// SQLite has no `ADD COLUMN IF NOT EXISTS` — a fresh install's CREATE TABLE
// already includes the column, so the ALTER TABLE below hits a "duplicate
// column" error, which we catch and ignore. Any other error still throws.
// Mirrors sqliteDenEconomyRepository.ts's own migration idiom (this
// project's established pattern for adding columns to an already-shipped
// table) — this is that same pattern's first use on this repository.
async function addColumnIfMissing(db: SQLite.SQLiteDatabase, table: string, columnDef: string): Promise<void> {
  try {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
  } catch (error) {
    if (!String(error).includes('duplicate column name')) {
      throw error;
    }
  }
}

export function createSqliteNotificationRepository(dbName: string = DEFAULT_DB_NAME): NotificationRepository {
  const dbPromise = SQLite.openDatabaseAsync(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS notification_bookkeeping (
        id TEXT PRIMARY KEY,
        overflowSurfaced INTEGER NOT NULL,
        learnedTimeOfDayBucket TEXT,
        walkReminderEnabled INTEGER NOT NULL DEFAULT 0,
        walkReminderHour INTEGER,
        walkReminderMinute INTEGER,
        walkReminderConsecutiveIgnores INTEGER NOT NULL DEFAULT 0,
        walkReminderPendingDate TEXT,
        walkReminderFiredCount INTEGER NOT NULL DEFAULT 0,
        walkReminderFollowedCount INTEGER NOT NULL DEFAULT 0,
        walkReminderExperimentStartedAt INTEGER
      );
    `);
    // Migration for rows created before the walk-reminder columns existed
    // (openspec/changes/walk-reminder) — this project's first schema
    // migration on this already-existing table. Every new column's default
    // here matches defaultWalkReminderFields()'s "never used yet" state,
    // which is exactly correct for a pre-existing install: the reminder was
    // never turned on, so off/null/zero is the honest starting point.
    await addColumnIfMissing(db, 'notification_bookkeeping', 'walkReminderEnabled INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, 'notification_bookkeeping', 'walkReminderHour INTEGER');
    await addColumnIfMissing(db, 'notification_bookkeeping', 'walkReminderMinute INTEGER');
    await addColumnIfMissing(db, 'notification_bookkeeping', 'walkReminderConsecutiveIgnores INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, 'notification_bookkeeping', 'walkReminderPendingDate TEXT');
    await addColumnIfMissing(db, 'notification_bookkeeping', 'walkReminderFiredCount INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, 'notification_bookkeeping', 'walkReminderFollowedCount INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, 'notification_bookkeeping', 'walkReminderExperimentStartedAt INTEGER');
    return db;
  });

  return {
    async getState(): Promise<NotificationBookkeepingState> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<NotificationBookkeepingRow>(
        'SELECT * FROM notification_bookkeeping WHERE id = ?',
        SINGLETON_ID
      );
      if (row) {
        return rowToState(row);
      }

      const initial = defaultNotificationBookkeepingState();
      await db.runAsync(
        `INSERT INTO notification_bookkeeping (
           id, overflowSurfaced, learnedTimeOfDayBucket,
           walkReminderEnabled, walkReminderHour, walkReminderMinute,
           walkReminderConsecutiveIgnores, walkReminderPendingDate,
           walkReminderFiredCount, walkReminderFollowedCount, walkReminderExperimentStartedAt
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        SINGLETON_ID,
        initial.overflowSurfaced ? 1 : 0,
        initial.learnedTimeOfDayBucket,
        initial.walkReminderEnabled ? 1 : 0,
        initial.walkReminderHour,
        initial.walkReminderMinute,
        initial.walkReminderConsecutiveIgnores,
        initial.walkReminderPendingDate,
        initial.walkReminderFiredCount,
        initial.walkReminderFollowedCount,
        initial.walkReminderExperimentStartedAt
      );
      return initial;
    },

    async saveState(state: NotificationBookkeepingState): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO notification_bookkeeping (
           id, overflowSurfaced, learnedTimeOfDayBucket,
           walkReminderEnabled, walkReminderHour, walkReminderMinute,
           walkReminderConsecutiveIgnores, walkReminderPendingDate,
           walkReminderFiredCount, walkReminderFollowedCount, walkReminderExperimentStartedAt
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           overflowSurfaced = excluded.overflowSurfaced,
           learnedTimeOfDayBucket = excluded.learnedTimeOfDayBucket,
           walkReminderEnabled = excluded.walkReminderEnabled,
           walkReminderHour = excluded.walkReminderHour,
           walkReminderMinute = excluded.walkReminderMinute,
           walkReminderConsecutiveIgnores = excluded.walkReminderConsecutiveIgnores,
           walkReminderPendingDate = excluded.walkReminderPendingDate,
           walkReminderFiredCount = excluded.walkReminderFiredCount,
           walkReminderFollowedCount = excluded.walkReminderFollowedCount,
           walkReminderExperimentStartedAt = excluded.walkReminderExperimentStartedAt`,
        SINGLETON_ID,
        state.overflowSurfaced ? 1 : 0,
        state.learnedTimeOfDayBucket,
        state.walkReminderEnabled ? 1 : 0,
        state.walkReminderHour,
        state.walkReminderMinute,
        state.walkReminderConsecutiveIgnores,
        state.walkReminderPendingDate,
        state.walkReminderFiredCount,
        state.walkReminderFollowedCount,
        state.walkReminderExperimentStartedAt
      );
    },
  };
}
