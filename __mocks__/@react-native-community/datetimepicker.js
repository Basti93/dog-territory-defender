// Jest mock for @react-native-community/datetimepicker: renders nothing.
function DateTimePicker() {
  return null;
}

module.exports = DateTimePicker;
module.exports.default = DateTimePicker;
module.exports.DateTimePickerAndroid = { open: jest.fn(), dismiss: jest.fn() };
