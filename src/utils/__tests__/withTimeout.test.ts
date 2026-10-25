import { TimeoutError, withTimeout } from '../withTimeout';

describe('withTimeout', () => {
  afterEach(() => jest.useRealTimers());

  it('passes the value and the error of a promise that settles in time', async () => {
    await expect(withTimeout(Promise.resolve(3), 50, 'x')).resolves.toBe(3);
    await expect(withTimeout(Promise.reject(new Error('no')), 50, 'x')).rejects.toThrow('no');
  });

  it('rejects with a TimeoutError when the promise never settles', async () => {
    jest.useFakeTimers();
    const result = withTimeout(new Promise(() => undefined), 100, 'db read');
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await jest.advanceTimersByTimeAsync(101);
    await assertion;
  });
});
