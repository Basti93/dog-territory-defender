// Jest mock for expo-document-picker: the player always cancels.
module.exports = { getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) };
