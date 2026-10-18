// Jest mock for expo-av: sounds "load" instantly and replay is a no-op.
const sound = { replayAsync: jest.fn(async () => ({})), unloadAsync: jest.fn(async () => ({})) };

module.exports = {
  Audio: {
    setAudioModeAsync: jest.fn(async () => {}),
    Sound: { createAsync: jest.fn(async () => ({ sound, status: {} })) },
  },
  InterruptionModeAndroid: { DoNotMix: 1, DuckOthers: 2 },
  InterruptionModeIOS: { DoNotMix: 1, MixWithOthers: 0 },
};
