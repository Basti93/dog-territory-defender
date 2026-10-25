jest.mock('../../utils/log', () => ({ log: jest.fn() }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: () => undefined,
  addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
  getLastNotificationResponseAsync: () => Promise.resolve(null),
}));
jest.mock('../repositories', () => ({
  localePreferenceLoaded: Promise.resolve('system'),
  runStartupMigrations: () => Promise.resolve(),
}));

import { act, renderHook } from '@testing-library/react-native';

import { STARTUP_DB_STEP_TIMEOUT_MS, useLaunchEffects } from '../useLaunchEffects';
import { log } from '../../utils/log';

function setup(repoOverrides: Record<string, unknown>) {
  const never = () => new Promise<never>(() => undefined);
  const repos = {
    denEconomyRepository: { getState: never, saveState: never },
    homeRangeRepository: { getWorldMass: never, getCells: async () => [] },
    personalStatsRepository: {},
    notificationRepository: {},
    settingsRepository: { getOnboardingDone: async () => false },
    walkRepository: {},
    territoryRepository: {},
    ...repoOverrides,
  };
  const deps = {
    repos: repos as never,
    applyFirstLaunch: jest.fn(),
    setTreats: jest.fn(),
    setPile: jest.fn(),
    setLevel: jest.fn(),
    openDen: jest.fn(),
    openDoorstep: jest.fn(),
    onRangeChanged: jest.fn(),
    onStartupTrouble: jest.fn(),
  };
  return deps;
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.useRealTimers());

describe('launch with a broken database', () => {
  it('a read that fails ("database is locked") reports startup trouble instead of staying blank', async () => {
    const deps = setup({ denEconomyRepository: { getState: async () => Promise.reject(new Error('database is locked')), saveState: async () => undefined } });
    await renderHook(() => useLaunchEffects(deps));
    await act(async () => undefined);
    expect(deps.onStartupTrouble).toHaveBeenCalledTimes(1);
    expect(deps.applyFirstLaunch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('LAUNCH_ROUTINE_ERROR', expect.objectContaining({ firstLaunchApplied: false }));
  });

  it('a read that never answers is cut off after the step timeout and reports trouble', async () => {
    jest.useFakeTimers();
    const deps = setup({});
    await renderHook(() => useLaunchEffects(deps));
    await act(async () => undefined);
    expect(deps.onStartupTrouble).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(STARTUP_DB_STEP_TIMEOUT_MS + 1);
    });
    expect(deps.onStartupTrouble).toHaveBeenCalledTimes(1);
    expect(deps.applyFirstLaunch).not.toHaveBeenCalled();
  });
});
