import React from 'react';
import { Image, ScrollView, StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { artOr } from '../art/artAssets';
import { material, palette, spacing } from './theme';

export interface ScreenProps {
  children?: React.ReactNode;
  /** Wrap content in a ScrollView. */
  scroll?: boolean;
  /** 'sky' draws the doorstep sky faded at the top; 'linen' tiles the linen cloth (paper screens). Default 'none'. */
  backdrop?: 'sky' | 'linen' | 'none';
  style?: StyleProp<ViewStyle>;
  /** Style for the inner content container (padding etc.). */
  contentStyle?: StyleProp<ViewStyle>;
  /** Side + bottom padding (top inset is always applied). Default true; false for content that pads itself. */
  padded?: boolean;
}

export function Screen({ children, scroll = false, backdrop = 'none', style, contentStyle, padded = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const pad: ViewStyle = {
    paddingTop: insets.top + spacing.md,
    paddingBottom: padded ? insets.bottom + spacing.lg : insets.bottom,
    paddingHorizontal: padded ? spacing.lg : 0,
  };
  const sky = backdrop === 'sky' ? artOr('doorstep-sky', null) : null;
  const linen = backdrop === 'linen' ? artOr('linen', null) : null;
  return (
    <View style={[styles.root, backdrop === 'linen' && styles.linenRoot, style]}>
      {/* Backdrop sits beside the ScrollView, never in its content. The tile gets an explicit pixel size
          (Android's 'repeat' needs one); the clipped wrapper keeps it from ever affecting layout. */}
      {linen && (
        <View pointerEvents="none" style={styles.backdrop}>
          <Image source={linen} resizeMode="repeat" style={{ width: window.width, height: window.height }} testID="screen-linen" />
        </View>
      )}
      {sky && (
        <View pointerEvents="none" style={styles.sky}>
          <Image source={sky} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
          {/* Cream fade-out: stacked translucent bands (no gradient dependency). */}
          {[0.25, 0.5, 0.75, 1].map((o, i) => (
            <View key={i} style={[styles.band, { top: `${50 + i * 12.5}%`, opacity: o }]} />
          ))}
        </View>
      )}
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[styles.grow, pad, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, pad, contentStyle]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  linenRoot: { backgroundColor: material.linen },
  fill: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  // flexGrow, never flex: 1: flex: 1 on a ScrollView content container locks it to the viewport on iOS (no scrolling).
  grow: { flexGrow: 1 },
  sky: { position: 'absolute', top: 0, left: 0, right: 0, height: 260, opacity: 0.55, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0, height: '12.5%', backgroundColor: palette.background },
});
