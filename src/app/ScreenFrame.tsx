import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeSlideIn, palette, TopBar } from '../ui';

/**
 * The cream container every screen sits in. `fadeKey` wraps the child in
 * FadeSlideIn (null = no wrapper). FadeSlideIn rule: Android WebViews inside
 * an animating-opacity parent can render blank. Never wrap a screen that hosts
 * a WebView (MapView, the Album, Territories via
 * TerritoryPortrait) in FadeSlideIn; see navigation.ts's screenKey.
 */
export function ScreenFrame({
  fadeKey,
  safeArea = false,
  treats,
  onOpenSettings,
  children,
}: {
  fadeKey: string | null;
  safeArea?: boolean;
  /** The treat count for the shared top bar. Omit on screens without one (first-launch flow). */
  treats?: number | null;
  /** The bar's gear opens Settings. Omit on the Settings screen. */
  onOpenSettings?: () => void;
  children: React.ReactNode;
}) {
  const body = fadeKey ? <FadeSlideIn key={fadeKey}>{children}</FadeSlideIn> : children;
  if (treats === undefined) {
    const Container = safeArea ? SafeAreaView : View;
    return (
      <SafeAreaProvider>
        <Container style={styles.container}>{body}</Container>
      </SafeAreaProvider>
    );
  }
  // The bar owns the top inset; the screen below it sees a top inset of 0 and keeps its own padding unchanged.
  const Container = safeArea ? SafeAreaView : View;
  return (
    <SafeAreaProvider>
      <Container style={styles.container} {...(safeArea ? { edges: ['bottom', 'left', 'right'] as const } : {})}>
        <BarAndBody treats={treats} onOpenSettings={onOpenSettings}>{body}</BarAndBody>
      </Container>
    </SafeAreaProvider>
  );
}

function BarAndBody({ treats, onOpenSettings, children }: { treats: number | null; onOpenSettings?: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <TopBar treats={treats ?? 0} onOpenSettings={onOpenSettings} />
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <View style={styles.body}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </>
  );
}

/** Cream blank view shown until Den state + settings are read. */
export function LoadingView() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  body: { flex: 1 },
});
