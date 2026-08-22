// Jest manual mock (openspec/changes/home-dashboard) — react-native-webview
// pulls in a native module (RNCWebViewModule) that doesn't exist in this
// project's plain jest-expo test environment (no native binary, no
// device/simulator). Every test in this codebase only ever exercises pure
// logic functions exported alongside a component, never a real render of
// the component tree (no @testing-library/react-native in package.json) —
// so this mock only needs to exist and not throw on import; it never needs
// to actually render a WebView. See DoorstepScreen.test.ts, which imports
// DoorstepScreen.tsx's pure functions and therefore transitively imports
// TerritoryPortrait.tsx -> react-native-webview.

function WebView() {
  return null;
}

module.exports = WebView;
module.exports.default = WebView;
module.exports.WebView = WebView;
