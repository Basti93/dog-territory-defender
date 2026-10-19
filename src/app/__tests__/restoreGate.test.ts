import { createRestoreGate, RESTORE_WAIT_MAX_MS, startWalkWhenRestored } from '../restoreGate';

function setup(settledWith?: string) {
  const gate = createRestoreGate();
  if (settledWith) gate.settle(settledWith);
  const start = jest.fn();
  const onResumedInstead = jest.fn();
  const onWaiting = jest.fn();
  const run = (timeoutMs?: number) => startWalkWhenRestored({ gate, start, onResumedInstead, onWaiting, timeoutMs });
  return { gate, start, onResumedInstead, onWaiting, run };
}

describe('startWalkWhenRestored', () => {
  it('starts at once, synchronously, when the restore is already over', () => {
    const { run, start, onWaiting } = setup('none');
    void run();
    expect(start).toHaveBeenCalledTimes(1);
    expect(onWaiting).not.toHaveBeenCalled();
  });

  it('is blocked until the restore has decided, and shows the waiting note meanwhile', async () => {
    const { gate, run, start, onWaiting } = setup();
    const result = run();
    await Promise.resolve();
    expect(start).not.toHaveBeenCalled();
    expect(onWaiting).toHaveBeenLastCalledWith(true);
    gate.settle('none');
    expect(await result).toBe('started');
    expect(start).toHaveBeenCalledTimes(1);
    expect(onWaiting).toHaveBeenLastCalledWith(false);
  });

  it('starts no second walk when the restore just resumed one', async () => {
    const { gate, run, start, onResumedInstead } = setup();
    const result = run();
    gate.settle('resumed');
    expect(await result).toBe('resumed-instead');
    expect(start).not.toHaveBeenCalled();
    expect(onResumedInstead).toHaveBeenCalledTimes(1);
  });

  it('still starts after a restore that finished, discarded or failed', async () => {
    for (const outcome of ['finished', 'discarded', 'skipped', 'error']) {
      const { gate, run, start } = setup();
      const result = run();
      gate.settle(outcome);
      await result;
      expect(start).toHaveBeenCalledTimes(1);
    }
  });

  it('a hung restore does not hold the player up forever', async () => {
    jest.useFakeTimers();
    try {
      const { run, start, onWaiting } = setup();
      const result = run();
      await jest.advanceTimersByTimeAsync(RESTORE_WAIT_MAX_MS + 1);
      expect(await result).toBe('started-after-timeout');
      expect(start).toHaveBeenCalledTimes(1);
      expect(onWaiting).toHaveBeenLastCalledWith(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the first outcome', () => {
    const gate = createRestoreGate();
    gate.settle('none');
    gate.settle('resumed');
    expect(gate.outcome()).toBe('none');
  });
});
