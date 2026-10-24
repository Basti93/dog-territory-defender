import { runInTransaction, setLockWaitLimitMs, withWriteLock } from '../dbLock';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('dbLock', () => {
  it('runs write transactions one at a time, in call order', async () => {
    let open = 0;
    let maxOpen = 0;
    const order: string[] = [];
    // Like expo-sqlite on a shared connection: a second BEGIN while one is open throws.
    const db = {
      withTransactionAsync: async (task: () => Promise<void>) => {
        if (open > 0) throw new Error('cannot start a transaction within a transaction');
        open++;
        maxOpen = Math.max(maxOpen, open);
        try {
          await task();
        } finally {
          open--;
        }
      },
    };
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
    expect(maxOpen).toBe(1);
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('keeps going after a failed transaction and still reports the failure to its caller', async () => {
    const failing = withWriteLock(async () => {
      throw new Error('boom');
    });
    const next = withWriteLock(async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  it('reports a nested call with a clear error instead of deadlocking', async () => {
    setLockWaitLimitMs(30);
    try {
      const db = { withTransactionAsync: async (task: () => Promise<void>) => task() };
      await expect(
        runInTransaction(db as never, async () => {
          await runInTransaction(db as never, async () => undefined);
        })
      ).rejects.toThrow(/nested|too long/);
    } finally {
      setLockWaitLimitMs(30_000);
    }
  });
});
