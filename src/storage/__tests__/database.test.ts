import * as SQLite from 'expo-sqlite';

import { DB_OPEN_TIMEOUT_MS, openSharedDatabase, resetSharedDatabases } from '../database';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
const openDatabaseAsync = SQLite.openDatabaseAsync as unknown as jest.Mock;

function fakeDb(execAsync: (sql: string) => Promise<void> = async () => undefined) {
  return { execAsync: jest.fn(execAsync) };
}

beforeEach(() => {
  resetSharedDatabases();
  openDatabaseAsync.mockReset();
});

describe('openSharedDatabase', () => {
  it('opens each file once and configures busy_timeout and WAL', async () => {
    const db = fakeDb();
    openDatabaseAsync.mockResolvedValue(db);
    const [a, b] = await Promise.all([openSharedDatabase('x.db'), openSharedDatabase('x.db')]);
    expect(a).toBe(b);
    expect(openDatabaseAsync).toHaveBeenCalledTimes(1);
    const sql = db.execAsync.mock.calls.map((c: unknown[]) => c[0]);
    expect(sql).toEqual(expect.arrayContaining([expect.stringContaining('busy_timeout'), expect.stringContaining('journal_mode = WAL')]));
  });

  it('still opens when switching to WAL fails (locked right now)', async () => {
    const db = fakeDb(async (sql) => {
      if (sql.includes('journal_mode')) throw new Error('database is locked');
    });
    openDatabaseAsync.mockResolvedValue(db);
    await expect(openSharedDatabase('x.db')).resolves.toBe(db);
  });

  it('forgets a failed open so the next caller can retry', async () => {
    openDatabaseAsync.mockRejectedValueOnce(new Error('database is locked'));
    await expect(openSharedDatabase('x.db')).rejects.toThrow('locked');
    const db = fakeDb();
    openDatabaseAsync.mockResolvedValue(db);
    await expect(openSharedDatabase('x.db')).resolves.toBe(db);
  });

  it('an open that never answers rejects instead of hanging', async () => {
    jest.useFakeTimers();
    try {
      openDatabaseAsync.mockReturnValue(new Promise(() => undefined));
      const result = openSharedDatabase('x.db');
      const assertion = expect(result).rejects.toThrow(/timed out/);
      await jest.advanceTimersByTimeAsync(DB_OPEN_TIMEOUT_MS + 1);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});
