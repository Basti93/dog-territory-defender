import type * as SQLite from 'expo-sqlite';

import { reportDatabaseEvent } from './dbEvents';

// Every repository uses the one shared connection (database.ts). A transaction there is BEGIN ... COMMIT on that
// connection, so two overlapping transactions (active-walk flush vs. walk save vs. sync) fail with "cannot start a
// transaction within a transaction" / "cannot rollback - no transaction is active". All write transactions therefore
// queue here, one at a time, process-wide.
//
// Never call runInTransaction from inside a runInTransaction callback: it would wait for itself. JS cannot tell a nested
// call from a legitimately queued one, so two limits turn every "stuck" into an error instead of a hang:
//  - a call that waits longer than lockWaitLimitMs for the calls before it is dropped (DB_LOCK_TIMEOUT phase 'wait');
//  - a task that runs longer than lockHoldLimitMs is only logged (DB_LOCK_TIMEOUT phase 'hold'). It keeps the lock: rolling
//    it back under a task that is still running would turn its remaining statements into autocommitted partial writes
//    and make its COMMIT fail. A slow but honest transaction (big walk save) therefore finishes; a truly stuck one makes
//    the callers behind it time out on the wait limit.
let tail: Promise<void> = Promise.resolve();
let lockWaitLimitMs = 60_000;
let lockHoldLimitMs = 30_000;

/** Test hook: how long a call may wait for the earlier ones before it is reported as a probable nested call. */
export function setLockWaitLimitMs(ms: number): void {
  lockWaitLimitMs = ms;
}
/** Test hook: how long one task may hold the lock before it is logged as slow. */
export function setLockHoldLimitMs(ms: number): void {
  lockHoldLimitMs = ms;
}

export class DbLockTimeoutError extends Error {
  readonly phase = 'wait';
  constructor(ms: number) {
    super(`withWriteLock: waited ${ms} ms for the earlier transaction; runInTransaction called from inside a runInTransaction callback, or a stuck holder`);
    this.name = 'DbLockTimeoutError';
  }
}

/** Resolves 'done' / rejects like `promise`, or resolves 'timeout' after `ms`. */
function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve({ timedOut: false, value });
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Runs `task` once every earlier call has finished, timed out or failed. */
export async function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => (release = resolve));
  let acquired = false;
  try {
    const turn = await raceTimeout(previous, lockWaitLimitMs);
    if (turn.timedOut) {
      reportDatabaseEvent('DB_LOCK_TIMEOUT', { phase: 'wait', ms: lockWaitLimitMs });
      throw new DbLockTimeoutError(lockWaitLimitMs);
    }
    acquired = true;
    const slowTimer = setTimeout(() => reportDatabaseEvent('DB_LOCK_TIMEOUT', { phase: 'hold', ms: lockHoldLimitMs }), lockHoldLimitMs);
    try {
      return await task();
    } finally {
      clearTimeout(slowTimer);
    }
  } finally {
    // A dropped waiter must not let the calls behind it overtake the holder it was waiting for.
    if (acquired) release();
    else previous.then(release);
  }
}

/**
 * `task` inside BEGIN IMMEDIATE ... COMMIT, serialised with every other write transaction. The transaction always ends:
 * a failing task is rolled back, and a failing rollback never hides the original error.
 * IMMEDIATE takes the write lock up front, where busy_timeout can wait for it (a deferred BEGIN that later upgrades to a
 * write fails at once if another connection wrote meanwhile).
 */
export function runInTransaction(db: SQLite.SQLiteDatabase, task: () => Promise<void>): Promise<void> {
  return withWriteLock(async () => {
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      await task();
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK').catch((rollbackError) => reportDatabaseEvent('DB_ROLLBACK_ERROR', { error: String(rollbackError) }));
      throw error;
    }
  });
}
