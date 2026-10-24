// Jest stand-in for expo-image-manipulator (native).
module.exports = {
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  manipulateAsync: jest.fn(async () => ({ uri: 'file:///mock.jpg', width: 1, height: 1, base64: 'AAAA' })),
};
