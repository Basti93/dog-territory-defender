import { openSharedDatabase } from '../storage/database';

const DB_NAME = 'dog-territory-defender.db';

const dbPromise = openSharedDatabase(DB_NAME).then(async (db) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS debug_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      line TEXT NOT NULL
    );
  `);
  return db;
});

// Read right here, before any log line of this run can be queued (every insert chains on dbPromise after this
// .then), so it is the newest line of the PREVIOUS run: APP_LAUNCH reports how long ago that was.
const previousRunLastLogAt: Promise<string | null> = dbPromise
  .then((db) => db.getFirstAsync<{ timestamp: string }>('SELECT timestamp FROM debug_log ORDER BY id DESC LIMIT 1'))
  .then((row) => row?.timestamp ?? null)
  .catch(() => null);

/** ISO time of the last log line written before this app start (null: first run, cleared log, or storage trouble). */
export function getPreviousRunLastLogAt(): Promise<string | null> {
  return previousRunLastLogAt;
}

/**
 * Durable, local, offline diagnostic log — survives regardless of build
 * variant or Metro/adb connectivity. Written to disk per entry so a
 * killed/backgrounded process still leaves everything logged before that
 * point on disk (unlike an in-memory-only buffer).
 */
export function appendToDebugLog(line: string): void {
  dbPromise
    .then((db) => db.runAsync('INSERT INTO debug_log (timestamp, line) VALUES (?, ?)', new Date().toISOString(), line))
    .catch(() => {
      // Logging must never crash the app it's trying to diagnose.
    });
}

export async function getDebugLogText(): Promise<string> {
  const db = await dbPromise;
  const rows = await db.getAllAsync<{ line: string }>('SELECT line FROM debug_log ORDER BY id ASC');
  return rows.map((r) => r.line).join('\n');
}

export async function getDebugLogCount(): Promise<number> {
  const db = await dbPromise;
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM debug_log');
  return row?.count ?? 0;
}

export async function clearDebugLog(): Promise<void> {
  const db = await dbPromise;
  await db.runAsync('DELETE FROM debug_log');
}
