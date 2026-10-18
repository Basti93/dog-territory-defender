// Jest mock for react-native-webview (native RNCWebViewModule is absent under
// jest). Renders an inert View so screens containing a WebView can mount;
// find it with getByTestId('webview'). The WebView never loads or posts messages.
const React = require('react');
const { View } = require('react-native');

const WebView = React.forwardRef(function WebView(props, ref) {
  React.useImperativeHandle(ref, () => ({
    postMessage: () => {},
    injectJavaScript: () => {},
    reload: () => {},
  }));
  return React.createElement(View, { testID: props.testID ?? 'webview', style: props.style });
});

module.exports = WebView;
module.exports.default = WebView;
module.exports.WebView = WebView;
