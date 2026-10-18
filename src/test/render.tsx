// Component-test harness. Import renderScreen instead of calling
// @testing-library/react-native's render directly:
//   - wraps the tree in a SafeAreaProvider with fixed metrics (iPhone-like insets),
//   - pins the locale to English (call setLocale('de') inside a test to switch),
//   - treats Nunito fonts as loaded.
// Native modules (expo-av, expo-haptics, expo-notifications, expo-sqlite,
// react-native-webview, ...) are mocked in the repo-root __mocks__/ folder.
//
// RNTL 14 is async: `await renderScreen(...)`, `await fireEvent.press(...)`.
import React from 'react';
import { StyleSheet } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, RenderOptions } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { setLocale } from '../i18n';

jest.mock('../ui/fonts', () => ({
  useAppFonts: () => ({ loaded: true, error: null }),
  font: () => undefined,
  fonts: {},
  resolveFont: () => undefined,
}));

// Fixed, device-independent metrics: 390x844 with a notch and a home indicator.
export const TEST_SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function renderScreen(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  setLocale('en');
  return render(ui, {
    ...options,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <SafeAreaProvider initialMetrics={initialWindowMetrics ?? TEST_SAFE_AREA_METRICS}>{children}</SafeAreaProvider>
    ),
  });
}

/** Flattened style of a rendered element, `{}` when it has none. */
export function styleOf(instance: TestInstance): Record<string, any> {
  return (StyleSheet.flatten(instance.props.style) ?? {}) as Record<string, any>;
}

/** Every rendered <Image> at or below `instance`. */
export function imagesIn(instance: TestInstance): TestInstance[] {
  return instance.queryAll((node) => node.type === 'Image');
}

/** Advance fake timers inside act so React's own scheduling drains. Needs jest.useFakeTimers(). */
export async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** Let pending promise callbacks (in-memory repo reads etc.) resolve inside act. */
export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * Timers React/RNTL leave behind after unmounting even an empty tree (pinned by
 * src/test/__tests__/harness.render.test.tsx, so a library upgrade that changes
 * it fails loudly there instead of silently weakening the leak check).
 */
export const IDLE_TIMER_FLOOR = 1;

/**
 * Leak check for components that own timers/animation loops. Needs jest.useFakeTimers().
 * Unmounts, lets React drain, and fails if any timer beyond the idle floor remains.
 */
export async function unmountAndExpectNoTimers(result: { unmount: () => Promise<void> }): Promise<void> {
  await result.unmount();
  await advance(100);
  expect(jest.getTimerCount()).toBeLessThanOrEqual(IDLE_TIMER_FLOOR);
}
