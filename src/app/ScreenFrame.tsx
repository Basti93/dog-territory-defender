import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { FadeSlideIn, palette } from '../ui';

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
  children,
}: {
  fadeKey: string | null;
  safeArea?: boolean;
  children: React.ReactNode;
}) {
  const Container = safeArea ? SafeAreaView : View;
  return (
    <SafeAreaProvider>
      <Container style={styles.container}>{fadeKey ? <FadeSlideIn key={fadeKey}>{children}</FadeSlideIn> : children}</Container>
    </SafeAreaProvider>
  );
}

/** Cream blank view shown until Den state + settings are read. */
export function LoadingView() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
});
