// A dead native player (released, e.g. after a hot reload) is re-created and retried once.
describe('play heal', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function makePlayer(play: () => void) {
    return { play: jest.fn(play), pause: jest.fn(), seekTo: jest.fn(async () => {}), remove: jest.fn(), currentTime: 0 };
  }

  function setup(secondPlay: () => void) {
    jest.resetModules();
    const dead = makePlayer(() => {
      throw new Error('Cannot use shared object that was already released');
    });
    const fresh = makePlayer(secondPlay);
    const createAudioPlayer = jest.fn<any, []>(() => dead);
    jest.doMock('expo-audio', () => ({ setAudioModeAsync: jest.fn(async () => {}), createAudioPlayer }));
    require('react-native').AppState.currentState = 'active';
    return { dead, fresh, createAudioPlayer, sounds: require('../sounds') };
  }

  it('re-creates the player once and plays on the retry', async () => {
    const { dead, fresh, createAudioPlayer, sounds } = setup(() => {});
    await sounds.preloadSounds();
    expect(createAudioPlayer).toHaveBeenCalledTimes(11);
    createAudioPlayer.mockImplementation(() => fresh);
    sounds.play('tap');
    await flush();
    expect(dead.play).toHaveBeenCalledTimes(1);
    expect(createAudioPlayer).toHaveBeenCalledTimes(12);
    expect(fresh.play).toHaveBeenCalledTimes(1);
    expect(dead.remove).toHaveBeenCalled();
  });

  it('seeks back to the start before replaying a player that has moved', async () => {
    const { dead, sounds } = setup(() => {});
    dead.play.mockImplementation(() => {});
    dead.currentTime = 0.4;
    await sounds.preloadSounds();
    sounds.play('tap');
    await flush();
    expect(dead.seekTo).toHaveBeenCalledWith(0);
    expect(dead.play).toHaveBeenCalledTimes(1);
  });

  it('gives up after one retry when the fresh player fails too', async () => {
    const { createAudioPlayer, fresh, sounds } = setup(() => {
      throw new Error('Cannot use shared object that was already released');
    });
    await sounds.preloadSounds();
    createAudioPlayer.mockImplementation(() => fresh);
    sounds.play('tap');
    await flush();
    expect(createAudioPlayer).toHaveBeenCalledTimes(12);
    expect(fresh.play).toHaveBeenCalledTimes(1);
  });
});
