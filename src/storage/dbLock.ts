import type * as SQLite from 'expo-sqlite';

// Every repository opens the same database file, and on Android expo-sqlite hands them one shared connection. A
// transaction there is BEGIN ... COMMIT on that connection, so two overlapping withTransactionAsync calls (active-walk
// flush vs. walk save vs. sync) fail with "cannot start a transaction within a transaction" / "cannot rollback - no
// transaction is active". All write transactions therefore queue here, one at a time, process-wide.
// Never call runInTransaction from inside a runInTransaction callback: it would wait for itself. JS cannot tell a nested
// call from a legitimately queued one, so in development and tests a call that waits longer than lockWaitLimitMs for the
// calls before it fails with a clear error instead of hanging for ever.
let tail: Promise<unknown> = Promise.resolve();
const isDev = typeof __DEV__ === 'undefined' ? true : __DEV__;
let lockWaitLimitMs = isDev ? 30_000 : Infinity;

/** Test hook: how long a call may wait for the earlier ones before it is reported as a probable nested call. */
export function setLockWaitLimitMs(ms: number): void {
  lockWaitLimitMs = ms;
}

/** Runs `task` once every earlier call has finished (whether it succeeded or failed). */
export function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = tail;
  const result = new Promise<T>((resolve, reject) => {
    let abandoned = false;
    const timer = Number.isFinite(lockWaitLimitMs)
      ? setTimeout(() => {
          abandoned = true;
          reject(new Error('withWriteLock: waited too long for the earlier transaction; runInTransaction called from inside a runInTransaction callback?'));
        }, lockWaitLimitMs)
      : null;
    previous
      .catch(() => undefined)
      .then(() => {
        if (timer) clearTimeout(timer);
        if (abandoned) return;
        return task().then(resolve, reject);
      });
  });
  tail = result.catch(() => undefined);
  return result;
}

/** `db.withTransactionAsync`, serialised with every other write transaction. */
export function runInTransaction(db: SQLite.SQLiteDatabase, task: () => Promise<void>): Promise<void> {
  return withWriteLock(() => db.withTransactionAsync(task));
}
