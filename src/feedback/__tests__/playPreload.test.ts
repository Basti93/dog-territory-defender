// play() must wait for the load before replaying, so the very first call is audible.
describe('play', () => {
  it('awaits the pending preload, then replays exactly once', async () => {
    jest.resetModules();
    const replay = jest.fn(async () => ({}));
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    jest.doMock('expo-av', () => ({
      Audio: {
        setAudioModeAsync: jest.fn(async () => {}),
        Sound: {
          createAsync: jest.fn(async () => {
            await gate;
            return { sound: { replayAsync: replay }, status: {} };
          }),
        },
      },
      InterruptionModeAndroid: { DoNotMix: 1 },
    }));
    const { play } = require('../sounds');
    play('buddy-1');
    await Promise.resolve();
    await Promise.resolve();
    expect(replay).not.toHaveBeenCalled();
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(replay).toHaveBeenCalledTimes(1);
  });
});
