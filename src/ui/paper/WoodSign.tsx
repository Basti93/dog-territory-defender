import React from 'react';
import { Image, ImageSourcePropType, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
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
  /** 9-slice sprite key. Default: the sprite matching `size`. Falls back to drawn Views while the PNG is missing. */
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

/** Default sprite per size, and its pixel height (for the dp-per-px scale below). */
const SPRITES: Record<WoodSignSize, { art: ArtKey; pxHeight: number }> = {
  small: { art: 'sign-small', pxHeight: 128 }, // 256x128
  medium: { art: 'sign-medium', pxHeight: 192 }, // 512x192
  wide: { art: 'sign-wide', pxHeight: 224 }, // 768x224
};

/** Cap insets of the sign PNGs, in PNG pixels. */
export const SIGN_CAP_PX = { top: 20, left: 20, right: 20, bottom: 28 } as const;

/**
 * capInsets are points relative to the rendered image, so the PNG caps are scaled by
 * (displayed minHeight / PNG height): the rim keeps the same proportion at every size.
 */
export function signCapInsets(size: WoodSignSize): { top: number; left: number; right: number; bottom: number } {
  const k = SIZES[size].minHeight / SPRITES[size].pxHeight;
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
  const source: ImageSourcePropType | undefined = (artOr(art ?? SPRITES[size].art, undefined) as ImageSourcePropType | undefined);
  const box: ViewStyle = {
    minHeight: s.minHeight,
    minWidth: s.minWidth,
    paddingHorizontal: s.px,
    paddingVertical: s.py,
    alignItems: 'center',
    justifyContent: 'center',
    ...(rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null),
  };
  const body = source ? (
    <View style={[box, style]}>
      {/* Own Image (not ImageBackground) so the sprite alone is inert to touches; children stay tappable. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Image source={source} resizeMode="stretch" capInsets={signCapInsets(size)} style={styles.sprite} />
      </View>
      {content}
    </View>
  ) : (
    <View style={[styles.face, box, style]}>{content}</View>
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
  // absoluteFill, not percentages: a % height against an auto-height sign can resolve to the PNG's intrinsic size.
  sprite: { ...StyleSheet.absoluteFillObject },
  stretch: { alignSelf: 'stretch' },
  text: { color: material.ink, textAlign: 'center' },
});
