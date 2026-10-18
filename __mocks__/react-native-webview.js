// Jest mock for react-native-webview (native RNCWebViewModule is absent under
// jest). Renders an inert View so screens containing a WebView can mount;
// find it with getByTestId('webview'). The WebView never loads or posts messages.
const React = require('react');
const { View } = require('react-native');

// Tests can read what the app posted to any WebView via `require('react-native-webview').posted` (reset it with `.length = 0`),
// and deliver a message from the page by calling the rendered view's `onMessage` prop.
const posted = [];

const WebView = React.forwardRef(function WebView(props, ref) {
  React.useImperativeHandle(ref, () => ({
    postMessage: (message) => {
      posted.push(message);
    },
    injectJavaScript: () => {},
    reload: () => {},
  }));
  React.useEffect(() => {
    // Mimics the real WebView: onLoadEnd fires once the page has loaded.
    if (props.onLoadEnd) props.onLoadEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return React.createElement(View, { testID: props.testID ?? 'webview', style: props.style, onMessage: props.onMessage });
});

module.exports = WebView;
module.exports.posted = posted;
module.exports.default = WebView;
module.exports.WebView = WebView;
