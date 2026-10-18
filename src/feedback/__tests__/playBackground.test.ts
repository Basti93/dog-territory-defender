// Owner decision: no sound at all while the app is not in front, not even the in-walk cues.
describe('play in the background', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function setup(appState: string) {
    jest.resetModules();
    const sound = {
      replayAsync: jest.fn(async () => ({})),
      stopAsync: jest.fn(async () => ({})),
      unloadAsync: jest.fn(async () => ({})),
    };
    const setAudioModeAsync = jest.fn(async () => {});
    jest.doMock('expo-av', () => ({
      Audio: { setAudioModeAsync, Sound: { createAsync: jest.fn(async () => ({ sound, status: {} })) } },
      InterruptionModeAndroid: { DoNotMix: 1 },
    }));
    const { AppState } = require('react-native');
    AppState.currentState = appState;
    return { sound, setAudioModeAsync, AppState, sounds: require('../sounds') };
  }

  it('drops play(), playBuddy() and walk cues when not active (no queueing)', async () => {
    const { sound, AppState, sounds } = setup('background');
    sounds.play('new-street');
    sounds.play('reward-reached');
    sounds.playBuddy();
    await flush();
    expect(sound.replayAsync).not.toHaveBeenCalled();
    AppState.currentState = 'active';
    await flush();
    expect(sound.replayAsync).not.toHaveBeenCalled();
  });

  it('drops a play whose load finished after the app left the foreground', async () => {
    const { sound, AppState, sounds } = setup('active');
    sounds.play('tap');
    AppState.currentState = 'background';
    await flush();
    expect(sound.replayAsync).not.toHaveBeenCalled();
  });

  it('plays in the foreground', async () => {
    const { sound, sounds } = setup('active');
    sounds.play('tap');
    await flush();
    expect(sound.replayAsync).toHaveBeenCalledTimes(1);
  });

  it('stops sounding effects when the app leaves the foreground', async () => {
    const { sound, AppState, sounds } = setup('active');
    await sounds.preloadSounds();
    const listener = AppState.addEventListener.mock.calls.find((c: unknown[]) => c[0] === 'change')![1];
    listener('active');
    expect(sound.stopAsync).not.toHaveBeenCalled();
    listener('inactive');
    expect(sound.stopAsync).toHaveBeenCalled();
  });

  it('does not keep the audio session alive in the background', async () => {
    const { setAudioModeAsync, sounds } = setup('active');
    await sounds.ensureAudioMode();
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ staysActiveInBackground: false }));
  });
});
