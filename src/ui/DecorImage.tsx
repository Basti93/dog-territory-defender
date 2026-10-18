import React from 'react';
import { Image, ImageResizeMode, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

export interface DecorImageProps {
  source: ImageSourcePropType;
  resizeMode?: ImageResizeMode;
  /** Layout of the box (position, size, offsets). The image fills it. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Purely decorative image (backdrop, ground strip, burst). RN's <Image> has no
 * typed `pointerEvents`, so the image sits in a View with pointerEvents="none":
 * an absolutely-positioned decoration can never swallow a tap meant for Buddy,
 * a button or the gear. Use this for any non-interactive absolute image.
 */
export function DecorImage({ source, resizeMode = 'cover', style }: DecorImageProps) {
  return (
    <View pointerEvents="none" style={style}>
      <Image source={source} resizeMode={resizeMode} style={StyleSheet.absoluteFill} />
    </View>
  );
}
