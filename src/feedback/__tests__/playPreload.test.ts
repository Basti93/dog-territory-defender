// play() must wait for the audio mode to be set (preload), so the very first call is audible.
describe('play', () => {
  it('awaits the pending audio mode, then plays exactly once', async () => {
    jest.resetModules();
    const play = jest.fn();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    jest.doMock('expo-audio', () => ({
      setAudioModeAsync: jest.fn(async () => {
        await gate;
      }),
      createAudioPlayer: jest.fn(() => ({ play, currentTime: 0, pause: jest.fn(), remove: jest.fn(), seekTo: jest.fn() })),
    }));
    require('react-native').AppState.currentState = 'active';
    const { play: playSound } = require('../sounds');
    playSound('buddy-1');
    await Promise.resolve();
    await Promise.resolve();
    expect(play).not.toHaveBeenCalled();
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(play).toHaveBeenCalledTimes(1);
  });
});
