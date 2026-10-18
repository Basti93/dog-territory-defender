// Jest mock for expo-audio: players are created instantly and every call is a no-op.
const makePlayer = () => ({
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(async () => {}),
  remove: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  currentTime: 0,
  volume: 1,
  loop: false,
  playing: false,
  isLoaded: true,
});

module.exports = {
  createAudioPlayer: jest.fn(() => makePlayer()),
  setAudioModeAsync: jest.fn(async () => {}),
};
