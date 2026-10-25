import * as SQLite from 'expo-sqlite';

import { withTimeout } from '../utils/withTimeout';
import { reportDatabaseEvent } from './dbEvents';

// One connection per database file per JS runtime. Every repository and the debug log used to call openDatabaseAsync
// themselves; expo-sqlite happens to hand out one native connection per runtime, but a second JS runtime (Android keeps
// the process alive for the foreground service after the app is swiped away) opens its own connection, and with the
// SQLite defaults (no busy timeout, rollback journal) it fails at once with "database is locked" while the old one is
// writing. busy_timeout makes it wait, WAL lets readers go on while someone writes.
export const BUSY_TIMEOUT_MS = 5_000;
/** The open (including the table setup the callers chain on) must never leave the app waiting for ever. */
export const DB_OPEN_TIMEOUT_MS = 15_000;

const opened = new Map<string, Promise<SQLite.SQLiteDatabase>>();

async function openAndConfigure(name: string): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
  try {
    await db.execAsync('PRAGMA journal_mode = WAL;');
  } catch (error) {
    // Switching the mode needs a lock; a database that is busy right now stays in its current mode.
    reportDatabaseEvent('DB_WAL_ERROR', { error: String(error) });
  }
  return db;
}

/** The shared connection for `name`. A failed or timed-out open is forgotten, so the next caller tries again. */
export function openSharedDatabase(name: string): Promise<SQLite.SQLiteDatabase> {
  const existing = opened.get(name);
  if (existing) return existing;
  const attempt = withTimeout(openAndConfigure(name), DB_OPEN_TIMEOUT_MS, `open ${name}`);
  opened.set(name, attempt);
  attempt.catch((error) => {
    if (opened.get(name) === attempt) opened.delete(name);
    reportDatabaseEvent('DB_OPEN_ERROR', { name, error: String(error) });
  });
  return attempt;
}

/** Test hook: forget every cached connection. */
export function resetSharedDatabases(): void {
  opened.clear();
}
