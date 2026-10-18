import React from 'react';
import { Image, ImageSourcePropType, Platform, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { ArtKey, artOr } from '../../art/artAssets';
import { PressableScale } from '../PressableScale';
import { material, textStyle } from '../theme';

export type WoodSignSize = 'small' | 'medium' | 'wide';

export interface WoodSignProps {
  /** Text (rendered in the `sign` style) or any node. */
  children?: React.ReactNode;
  size?: WoodSignSize;
  /** Slight tilt in degrees, e.g. 3. */
  rotate?: number;
  onPress?: () => void;
  /** Dims the sign and ignores presses (only meaningful with `onPress`). */
  disabled?: boolean;
  /** Stretch to the parent's width (primary buttons in a column). */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  /**
   * Optional sprite key, painted behind the text, absolutely positioned and stretched to the sign.
   * Default is NO sprite: the drawn face below is always the base, so the sprite's pixel size can never drive the layout
   * (Android ignores capInsets and the 256-768px PNGs blew signs up to hundreds of dp).
   */
  art?: ArtKey;
  style?: StyleProp<ViewStyle>;
  textStyleOverride?: StyleProp<TextStyle>;
  testID?: string;
}

const SIZES: Record<WoodSignSize, { minHeight: number; minWidth: number; px: number; py: number }> = {
  small: { minHeight: 36, minWidth: 0, px: 12, py: 4 },
  medium: { minHeight: 48, minWidth: 96, px: 16, py: 6 },
  wide: { minHeight: 58, minWidth: 176, px: 20, py: 8 },
};

/** Cap insets of the sign PNGs, in PNG pixels. */
export const SIGN_CAP_PX = { top: 20, left: 20, right: 20, bottom: 28 } as const;

/** PNG pixel height of the sprite behind each size (only used to scale capInsets for an explicit `art`). */
const SPRITE_PX_HEIGHT: Record<WoodSignSize, number> = { small: 128, medium: 192, wide: 224 };

/**
 * capInsets are points relative to the rendered image, so the PNG caps are scaled by
 * (displayed minHeight / PNG height): the rim keeps the same proportion at every size.
 */
export function signCapInsets(size: WoodSignSize): { top: number; left: number; right: number; bottom: number } {
  const k = SIZES[size].minHeight / SPRITE_PX_HEIGHT[size];
  return {
    top: SIGN_CAP_PX.top * k,
    left: SIGN_CAP_PX.left * k,
    right: SIGN_CAP_PX.right * k,
    bottom: SIGN_CAP_PX.bottom * k,
  };
}

/** Wooden signboard: light face, darker rim, 3px bottom edge. Tappable when `onPress` is given. */
export function WoodSign({
  children,
  size = 'medium',
  rotate,
  onPress,
  disabled,
  fullWidth,
  accessibilityLabel,
  art,
  style,
  textStyleOverride,
  testID,
}: WoodSignProps) {
  const s = SIZES[size];
  const content =
    typeof children === 'string' || typeof children === 'number' ? (
      <Text style={[textStyle('sign'), styles.text, textStyleOverride]}>{children}</Text>
    ) : (
      children
    );
  const source = art ? (artOr(art, undefined) as ImageSourcePropType | undefined) : undefined;
  // Size comes from text + padding + minHeight/minWidth only. alignSelf 'center' shrink-wraps the sign inside its (possibly
  // parent-stretched) wrapper; the wrapper itself follows the parent's alignItems so callers keep control of placement.
  const box: ViewStyle = {
    minHeight: s.minHeight,
    minWidth: s.minWidth,
    paddingHorizontal: s.px,
    paddingVertical: s.py,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: fullWidth ? 'stretch' : 'center',
    ...(rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null),
  };
  const body = (
    <View style={[styles.face, box, source ? styles.faceWithSprite : null, style]}>
      {source ? (
        // Absolute with explicit insets: out of flow, so it cannot size the sign.
        <Image
          source={source}
          resizeMode="stretch"
          capInsets={Platform.OS === 'ios' ? signCapInsets(size) : undefined}
          style={styles.sprite}
        />
      ) : null}
      {content}
    </View>
  );
  if (!onPress) return <View accessibilityLabel={accessibilityLabel} testID={testID}>{body}</View>;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
      testID={testID}
      feedback="tap"
      style={fullWidth ? styles.stretch : undefined}
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  face: {
    backgroundColor: material.woodLight,
    borderWidth: 3,
    borderColor: material.woodRim,
    borderBottomWidth: 6, // 3px rim + 3px darker bottom edge
    borderBottomColor: material.woodDark,
    borderRadius: 10,
  },
  // Drop the drawn paint when a sprite is painted over it (the layout box and padding stay).
  faceWithSprite: { backgroundColor: 'transparent', borderColor: 'transparent' },
  // absoluteFill with explicit 0 insets, never a percentage height (could resolve to the PNG's intrinsic size).
  sprite: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  stretch: { alignSelf: 'stretch' },
  text: { color: material.ink, textAlign: 'center' },
});
