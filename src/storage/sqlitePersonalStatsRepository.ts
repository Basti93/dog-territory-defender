import * as SQLite from 'expo-sqlite';

import { AchievementId, defaultPersonalStatsState, PersonalStatsState } from '../economy/personalStats';
import { PersonalStatsRepository, UnlockedAchievement } from './PersonalStatsRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';
const SINGLETON_ID = 'singleton';

interface PersonalStatsRow {
  id: string;
  totalWalksClosed: number;
  lifetimeDistanceMeters: number;
  lifetimeTerritoryAreaM2: number;
  biggestTerritoryAreaM2: number;
  longestWalkDistanceM: number;
  totalTreatsEarnedLifetime: number;
  firstWalkAt: number | null;
}

interface AchievementRow {
  id: string;
  unlockedAt: number;
}

function rowToState(row: PersonalStatsRow): PersonalStatsState {
  return {
    totalWalksClosed: row.totalWalksClosed,
    lifetimeDistanceMeters: row.lifetimeDistanceMeters,
    lifetimeTerritoryAreaM2: row.lifetimeTerritoryAreaM2,
    biggestTerritoryAreaM2: row.biggestTerritoryAreaM2,
    longestWalkDistanceM: row.longestWalkDistanceM,
    totalTreatsEarnedLifetime: row.totalTreatsEarnedLifetime,
    firstWalkAt: row.firstWalkAt,
  };
}

export function createSqlitePersonalStatsRepository(dbName: string = DEFAULT_DB_NAME): PersonalStatsRepository {
  const dbPromise = SQLite.openDatabaseAsync(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS personal_stats (
        id TEXT PRIMARY KEY,
        totalWalksClosed INTEGER NOT NULL,
        lifetimeDistanceMeters REAL NOT NULL,
        lifetimeTerritoryAreaM2 REAL NOT NULL,
        biggestTerritoryAreaM2 REAL NOT NULL,
        longestWalkDistanceM REAL NOT NULL,
        totalTreatsEarnedLifetime REAL NOT NULL,
        firstWalkAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        unlockedAt INTEGER NOT NULL
      );
    `);
    return db;
  });

  return {
    async getState(): Promise<PersonalStatsState> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<PersonalStatsRow>('SELECT * FROM personal_stats WHERE id = ?', SINGLETON_ID);
      if (row) {
        return rowToState(row);
      }

      const initial = defaultPersonalStatsState();
      await db.runAsync(
        `INSERT INTO personal_stats (
          id, totalWalksClosed, lifetimeDistanceMeters, lifetimeTerritoryAreaM2,
          biggestTerritoryAreaM2, longestWalkDistanceM, totalTreatsEarnedLifetime, firstWalkAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        SINGLETON_ID,
        initial.totalWalksClosed,
        initial.lifetimeDistanceMeters,
        initial.lifetimeTerritoryAreaM2,
        initial.biggestTerritoryAreaM2,
        initial.longestWalkDistanceM,
        initial.totalTreatsEarnedLifetime,
        initial.firstWalkAt
      );
      return initial;
    },

    async saveState(state: PersonalStatsState): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO personal_stats (
          id, totalWalksClosed, lifetimeDistanceMeters, lifetimeTerritoryAreaM2,
          biggestTerritoryAreaM2, longestWalkDistanceM, totalTreatsEarnedLifetime, firstWalkAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          totalWalksClosed = excluded.totalWalksClosed,
          lifetimeDistanceMeters = excluded.lifetimeDistanceMeters,
          lifetimeTerritoryAreaM2 = excluded.lifetimeTerritoryAreaM2,
          biggestTerritoryAreaM2 = excluded.biggestTerritoryAreaM2,
          longestWalkDistanceM = excluded.longestWalkDistanceM,
          totalTreatsEarnedLifetime = excluded.totalTreatsEarnedLifetime,
          firstWalkAt = excluded.firstWalkAt`,
        SINGLETON_ID,
        state.totalWalksClosed,
        state.lifetimeDistanceMeters,
        state.lifetimeTerritoryAreaM2,
        state.biggestTerritoryAreaM2,
        state.longestWalkDistanceM,
        state.totalTreatsEarnedLifetime,
        state.firstWalkAt
      );
    },

    async getUnlockedAchievements(): Promise<UnlockedAchievement[]> {
      const db = await dbPromise;
      const rows = await db.getAllAsync<AchievementRow>('SELECT * FROM achievements ORDER BY unlockedAt ASC');
      return rows.map((row) => ({ id: row.id as AchievementId, unlockedAt: row.unlockedAt }));
    },

    async replaceUnlockedAchievements(list: UnlockedAchievement[]): Promise<void> {
      const db = await dbPromise;
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM achievements');
        for (const a of list) {
          await db.runAsync('INSERT OR REPLACE INTO achievements (id, unlockedAt) VALUES (?, ?)', a.id, a.unlockedAt);
        }
      });
    },

    async unlockAchievements(ids: AchievementId[], unlockedAt: number): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      const db = await dbPromise;
      for (const id of ids) {
        await db.runAsync('INSERT OR IGNORE INTO achievements (id, unlockedAt) VALUES (?, ?)', id, unlockedAt);
      }
    },
  };
}
