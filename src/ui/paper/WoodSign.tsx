import React from 'react';
import { ImageBackground, ImageSourcePropType, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
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
  accessibilityLabel?: string;
  /** Optional 9-slice sprite key (e.g. 'sign-medium'); falls back to Views while the PNG is missing. */
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

const CAP = 14;

/** Wooden signboard: light face, darker rim, 3px bottom edge. Tappable when `onPress` is given. */
export function WoodSign({
  children,
  size = 'medium',
  rotate,
  onPress,
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
  const source: ImageSourcePropType | undefined = art ? (artOr(art, undefined) as ImageSourcePropType | undefined) : undefined;
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
    <ImageBackground source={source} resizeMode="stretch" capInsets={{ top: CAP, left: CAP, bottom: CAP, right: CAP }} style={[box, style]}>
      {content}
    </ImageBackground>
  ) : (
    <View style={[styles.face, box, style]}>{content}</View>
  );
  if (!onPress) return <View accessibilityLabel={accessibilityLabel} testID={testID}>{body}</View>;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel} testID={testID} feedback="tap">
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
  text: { color: material.ink, textAlign: 'center' },
});
