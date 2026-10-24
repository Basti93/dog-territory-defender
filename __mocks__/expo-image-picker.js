// Jest stand-in for expo-image-picker (native). Tests that need photos inject a DogPhotoPort instead.
module.exports = {
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
};
