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
}

function rowToState(row: NotificationBookkeepingRow): NotificationBookkeepingState {
  return {
    overflowSurfaced: row.overflowSurfaced === 1,
    learnedTimeOfDayBucket: (row.learnedTimeOfDayBucket as TimeOfDayBucket | null) ?? null,
  };
}

export function createSqliteNotificationRepository(dbName: string = DEFAULT_DB_NAME): NotificationRepository {
  const dbPromise = SQLite.openDatabaseAsync(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS notification_bookkeeping (
        id TEXT PRIMARY KEY,
        overflowSurfaced INTEGER NOT NULL,
        learnedTimeOfDayBucket TEXT
      );
    `);
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
        `INSERT INTO notification_bookkeeping (id, overflowSurfaced, learnedTimeOfDayBucket) VALUES (?, ?, ?)`,
        SINGLETON_ID,
        initial.overflowSurfaced ? 1 : 0,
        initial.learnedTimeOfDayBucket
      );
      return initial;
    },

    async saveState(state: NotificationBookkeepingState): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO notification_bookkeeping (id, overflowSurfaced, learnedTimeOfDayBucket)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           overflowSurfaced = excluded.overflowSurfaced,
           learnedTimeOfDayBucket = excluded.learnedTimeOfDayBucket`,
        SINGLETON_ID,
        state.overflowSurfaced ? 1 : 0,
        state.learnedTimeOfDayBucket
      );
    },
  };
}
