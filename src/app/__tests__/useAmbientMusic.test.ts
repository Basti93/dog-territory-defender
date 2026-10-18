import { AmbientState, QUIET_AFTER_MS, shouldPlayAmbient, startQuietTimer } from '../useAmbientMusic';

const base: AmbientState = { screen: 'doorstep', walkActive: false, enabled: true, appActive: true, quiet: false };

describe('shouldPlayAmbient', () => {
  it('plays on doorstep, den and celebration', () => {
    for (const screen of ['doorstep', 'den', 'celebration']) expect(shouldPlayAmbient({ ...base, screen })).toBe(true);
  });

  it('is silent on every other screen', () => {
    for (const screen of ['map', 'territories', 'history', 'debugLog', 'settings', 'stats', 'logMissedWalk']) {
      expect(shouldPlayAmbient({ ...base, screen })).toBe(false);
    }
  });

  it('is silent during a walk, when disabled, in the background, or in the quiet window', () => {
    expect(shouldPlayAmbient({ ...base, walkActive: true })).toBe(false);
    expect(shouldPlayAmbient({ ...base, enabled: false })).toBe(false);
    expect(shouldPlayAmbient({ ...base, appActive: false })).toBe(false);
    expect(shouldPlayAmbient({ ...base, quiet: true })).toBe(false);
  });
});

describe('startQuietTimer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fires after 5 minutes, not before', () => {
    const onElapsed = jest.fn();
    startQuietTimer(onElapsed);
    jest.advanceTimersByTime(QUIET_AFTER_MS - 1);
    expect(onElapsed).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it('cancel stops it (screen change / pause)', () => {
    const onElapsed = jest.fn();
    const cancel = startQuietTimer(onElapsed);
    jest.advanceTimersByTime(QUIET_AFTER_MS - 1000);
    cancel();
    jest.advanceTimersByTime(QUIET_AFTER_MS);
    expect(onElapsed).not.toHaveBeenCalled();
  });
});
