// Jest mock for expo-sharing: the share sheet is unavailable.
module.exports = { isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn(async () => {}) };
