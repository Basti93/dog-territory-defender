import { runInTransaction, setLockHoldLimitMs, setLockWaitLimitMs, withWriteLock } from '../dbLock';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Like the shared expo-sqlite connection: BEGIN inside a transaction, or COMMIT/ROLLBACK outside one, throws. */
function fakeDb(options: { failRollback?: boolean } = {}) {
  const calls: string[] = [];
  let open = 0;
  let maxOpen = 0;
  return {
    calls,
    get open() {
      return open;
    },
    get maxOpen() {
      return maxOpen;
    },
    execAsync: async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith('BEGIN')) {
        if (open > 0) throw new Error('cannot start a transaction within a transaction');
        open++;
        maxOpen = Math.max(maxOpen, open);
      } else if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        if (sql === 'ROLLBACK' && options.failRollback) throw new Error('database is locked');
        if (open === 0) throw new Error(`cannot ${sql.toLowerCase()} - no transaction is active`);
        open--;
      }
    },
  };
}

afterEach(() => {
  setLockWaitLimitMs(60_000);
  setLockHoldLimitMs(30_000);
});

describe('dbLock', () => {
  it('runs write transactions one at a time, in call order', async () => {
    const db = fakeDb();
    const order: string[] = [];
    const job = (name: string) => () => {
      order.push(`start ${name}`);
      return tick().then(() => {
        order.push(`end ${name}`);
      });
    };
    await Promise.all([
      runInTransaction(db as never, job('a')),
      runInTransaction(db as never, job('b')),
      runInTransaction(db as never, job('c')),
    ]);
    expect(db.maxOpen).toBe(1);
    expect(db.open).toBe(0);
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('keeps going after a failed transaction, rolls it back and still reports the failure to its caller', async () => {
    const db = fakeDb();
    const failing = runInTransaction(db as never, async () => {
      throw new Error('boom');
    });
    const next = runInTransaction(db as never, async () => undefined);
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBeUndefined();
    expect(db.open).toBe(0);
    expect(db.calls).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK', 'BEGIN IMMEDIATE', 'COMMIT']);
  });

  it('a failing ROLLBACK does not hide the original error or block the queue', async () => {
    const db = fakeDb({ failRollback: true });
    await expect(
      runInTransaction(db as never, async () => {
        throw new Error('first');
      })
    ).rejects.toThrow('first');
    await expect(withWriteLock(async () => 'next')).resolves.toBe('next');
  });

  it('reports a nested call with a clear error instead of deadlocking', async () => {
    setLockWaitLimitMs(30);
    const db = fakeDb();
    await expect(
      runInTransaction(db as never, async () => {
        await runInTransaction(db as never, async () => undefined);
      })
    ).rejects.toThrow(/waited|nested/);
    // The outer transaction was rolled back and the lock is free again.
    expect(db.open).toBe(0);
    await expect(runInTransaction(db as never, async () => undefined)).resolves.toBeUndefined();
  });

  it('a slow task keeps the lock and its transaction: it is logged, not rolled back', async () => {
    setLockHoldLimitMs(10);
    const db = fakeDb();
    const slow = runInTransaction(db as never, () => new Promise<void>((resolve) => setTimeout(resolve, 50)));
    const next = runInTransaction(db as never, async () => undefined);
    await expect(slow).resolves.toBeUndefined();
    await expect(next).resolves.toBeUndefined();
    expect(db.calls).toEqual(['BEGIN IMMEDIATE', 'COMMIT', 'BEGIN IMMEDIATE', 'COMMIT']);
  });

  it('a waiter that gave up does not let the next one overtake the holder', async () => {
    setLockWaitLimitMs(30);
    const db = fakeDb();
    let finishHolder!: () => void;
    const holder = runInTransaction(db as never, () => new Promise<void>((resolve) => (finishHolder = resolve)));
    const dropped = runInTransaction(db as never, async () => undefined);
    dropped.catch(() => undefined);
    setLockWaitLimitMs(60_000);
    const third = runInTransaction(db as never, async () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 60));
    await expect(dropped).rejects.toMatchObject({ phase: 'wait' });
    expect(db.calls).toEqual(['BEGIN IMMEDIATE']);
    finishHolder();
    await holder;
    await expect(third).resolves.toBeUndefined();
    expect(db.calls).toEqual(['BEGIN IMMEDIATE', 'COMMIT', 'BEGIN IMMEDIATE', 'COMMIT']);
  });

  it('a caller behind a stuck holder gives up after the wait limit', async () => {
    setLockWaitLimitMs(30);
    const stuck = withWriteLock(() => new Promise<void>(() => undefined));
    stuck.catch(() => undefined);
    await expect(withWriteLock(async () => 'late')).rejects.toMatchObject({ name: 'DbLockTimeoutError', phase: 'wait' });
  });
});
