// A dead native player ("Player does not exist." after a hot reload) is re-created and retried once.
describe('play heal', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function setup(secondReplay: () => Promise<any>) {
    jest.resetModules();
    const dead = {
      replayAsync: jest.fn(async () => {
        throw new Error('Player does not exist.');
      }),
      unloadAsync: jest.fn(async () => ({})),
    };
    const fresh = { replayAsync: jest.fn(secondReplay), unloadAsync: jest.fn(async () => ({})) };
    const createAsync = jest.fn<Promise<{ sound: any; status: object }>, []>(async () => ({ sound: dead, status: {} }));
    jest.doMock('expo-av', () => ({
      Audio: { setAudioModeAsync: jest.fn(async () => {}), Sound: { createAsync } },
      InterruptionModeAndroid: { DoNotMix: 1 },
    }));
    return { dead, fresh, createAsync, sounds: require('../sounds') };
  }

  it('re-creates the sound once and plays on the retry', async () => {
    const { dead, fresh, createAsync, sounds } = setup(async () => ({}));
    await sounds.preloadSounds();
    expect(createAsync).toHaveBeenCalledTimes(11);
    createAsync.mockImplementation(async () => ({ sound: fresh, status: {} }));
    sounds.play('tap');
    await flush();
    expect(dead.replayAsync).toHaveBeenCalledTimes(1);
    expect(createAsync).toHaveBeenCalledTimes(12);
    expect(fresh.replayAsync).toHaveBeenCalledTimes(1);
    expect(dead.unloadAsync).toHaveBeenCalled();
  });

  it('reloads when getStatusAsync says not loaded, before replaying', async () => {
    const { dead, fresh, createAsync, sounds } = setup(async () => ({}));
    (dead as any).getStatusAsync = jest.fn(async () => ({ isLoaded: false }));
    await sounds.preloadSounds();
    createAsync.mockImplementation(async () => ({ sound: fresh, status: {} }));
    sounds.play('sleepy');
    await flush();
    expect(dead.replayAsync).not.toHaveBeenCalled();
    expect(fresh.replayAsync).toHaveBeenCalledTimes(1);
  });

  it('gives up after one retry when the fresh player fails too', async () => {
    const { createAsync, fresh, sounds } = setup(async () => {
      throw new Error('Player does not exist.');
    });
    await sounds.preloadSounds();
    createAsync.mockImplementation(async () => ({ sound: fresh, status: {} }));
    sounds.play('tap');
    await flush();
    expect(createAsync).toHaveBeenCalledTimes(12);
    expect(fresh.replayAsync).toHaveBeenCalledTimes(1);
  });
});
