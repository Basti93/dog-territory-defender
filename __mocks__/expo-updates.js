// Jest mock for expo-updates: disabled by default (like a dev client); tests flip `isEnabled`.
module.exports = {
  isEnabled: false,
  updateId: null,
  channel: null,
  checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })),
  fetchUpdateAsync: jest.fn(async () => ({ isNew: true })),
  reloadAsync: jest.fn(async () => {}),
};
