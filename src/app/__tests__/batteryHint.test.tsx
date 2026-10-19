import { renderHook, act } from '@testing-library/react-native';
import { Alert, AppState, Linking } from 'react-native';

import { batteryHintApplies, openBatterySettings, useBatteryHint } from '../batteryHint';
import { createInMemorySettingsRepository } from '../../storage/inMemorySettingsRepository';

jest.mock('../../utils/log', () => ({ log: jest.fn() }));

const setAppState = (state: string) => Object.defineProperty(AppState, 'currentState', { value: state, configurable: true, writable: true });

beforeEach(() => {
  setAppState('active');
  jest.useFakeTimers();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const flush = async (ms = 9_000) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

describe('useBatteryHint', () => {
  it('asks once on Android after a walk start, and remembers it', async () => {
    const settings = createInMemorySettingsRepository();
    const { rerender } = await renderHook((p: { tracking: boolean }) => useBatteryHint({ settings, isTracking: p.tracking, blocked: false, platform: 'android' }), {
      initialProps: { tracking: true },
    });
    await flush();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(await settings.getBatteryHintShown()).toBe(true);
    // a second walk, same app run: no repeat
    await rerender({ tracking: false });
    await rerender({ tracking: true });
    await flush();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it('never asks when it was already shown (an earlier app run)', async () => {
    const settings = createInMemorySettingsRepository();
    await settings.saveBatteryHintShown(true);
    await renderHook(() => useBatteryHint({ settings, isTracking: true, blocked: false, platform: 'android' }));
    await flush();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('is Android only', async () => {
    const settings = createInMemorySettingsRepository();
    await renderHook(() => useBatteryHint({ settings, isTracking: true, blocked: false, platform: 'ios' }));
    await flush();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(batteryHintApplies('ios')).toBe(false);
  });

  it('waits while another question is on screen, and without a walk it stays quiet', async () => {
    const settings = createInMemorySettingsRepository();
    const { rerender } = await renderHook((p: { blocked: boolean; tracking: boolean }) => useBatteryHint({ settings, isTracking: p.tracking, blocked: p.blocked, platform: 'android' }), {
      initialProps: { blocked: true, tracking: true },
    });
    await flush();
    expect(Alert.alert).not.toHaveBeenCalled();
    await rerender({ blocked: false, tracking: false });
    await flush();
    expect(Alert.alert).not.toHaveBeenCalled();
    await rerender({ blocked: false, tracking: true });
    await flush();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });
});

describe('useBatteryHint with the phone already in the pocket', () => {
  it('waits for the app to come to the front instead of losing the Alert, and does not mark it shown early', async () => {
    const settings = createInMemorySettingsRepository();
    let listener: (state: string) => void = () => undefined;
    setAppState('background');
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (state: string) => void) => {
      listener = fn;
      return { remove: jest.fn() };
    }) as never);
    await renderHook(() => useBatteryHint({ settings, isTracking: true, blocked: false, platform: 'android' }));
    await flush();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(await settings.getBatteryHintShown()).toBe(false);
    await act(async () => {
      listener('active');
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(await settings.getBatteryHintShown()).toBe(true);
  });
});

describe('openBatterySettings', () => {
  it('falls back to the app settings page when the battery list intent is refused', async () => {
    const platform = jest.requireActual('react-native').Platform;
    const original = platform.OS;
    platform.OS = 'android';
    try {
      const send = jest.spyOn(Linking, 'sendIntent').mockRejectedValue(new Error('no activity'));
      const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
      await openBatterySettings();
      expect(send).toHaveBeenCalledWith('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
      expect(open).toHaveBeenCalledTimes(1);
    } finally {
      platform.OS = original;
    }
  });
});
