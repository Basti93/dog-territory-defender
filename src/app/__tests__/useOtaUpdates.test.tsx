import { renderHook, waitFor } from '@testing-library/react-native';
import * as Updates from 'expo-updates';
import { useOtaUpdates } from '../useOtaUpdates';

const mocked = Updates as unknown as {
  isEnabled: boolean;
  checkForUpdateAsync: jest.Mock;
  fetchUpdateAsync: jest.Mock;
  reloadAsync: jest.Mock;
};
const globalAny = global as unknown as { __DEV__: boolean };
const originalDev = globalAny.__DEV__;

beforeEach(() => {
  jest.clearAllMocks();
  globalAny.__DEV__ = false;
  mocked.isEnabled = true;
  mocked.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
});
afterEach(() => {
  globalAny.__DEV__ = originalDev;
  mocked.isEnabled = false;
});

describe('useOtaUpdates', () => {
  it('fetches an available update and flags it ready', async () => {
    mocked.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    const { result } = await renderHook(() => useOtaUpdates());
    await waitFor(() => expect(result.current.updateReady).toBe(true));
    expect(mocked.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(result.current.showUpdateCard).toBe(true);
    result.current.apply();
    expect(mocked.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when nothing is available', async () => {
    const { result } = await renderHook(() => useOtaUpdates());
    await waitFor(() => expect(mocked.checkForUpdateAsync).toHaveBeenCalled());
    expect(mocked.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(result.current.updateReady).toBe(false);
    expect(await result.current.checkNow()).toBe('current');
  });

  it('swallows errors', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mocked.checkForUpdateAsync.mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => useOtaUpdates());
    await waitFor(() => expect(mocked.checkForUpdateAsync).toHaveBeenCalled());
    expect(result.current.updateReady).toBe(false);
    expect(await result.current.checkNow()).toBe('unavailable');
  });

  it('never checks in dev or when expo-updates is disabled', async () => {
    globalAny.__DEV__ = true;
    await renderHook(() => useOtaUpdates());
    globalAny.__DEV__ = false;
    mocked.isEnabled = false;
    const { result } = await renderHook(() => useOtaUpdates());
    expect(await result.current.checkNow()).toBe('unavailable');
    expect(mocked.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('"Später" hides the card until a manual check finds an update', async () => {
    mocked.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    const { result } = await renderHook(() => useOtaUpdates());
    await waitFor(() => expect(result.current.showUpdateCard).toBe(true));
    await result.current.dismiss();
    await waitFor(() => expect(result.current.showUpdateCard).toBe(false));
    await result.current.checkNow();
    await waitFor(() => expect(result.current.showUpdateCard).toBe(true));
  });
});
