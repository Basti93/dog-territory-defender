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
      {/* Explicit percentage size, never absoluteFill insets: an Android <Image> sized only by
          left/top/right/bottom insets renders at its intrinsic pixel size (a 2048px hill became
          a 2048dp image, so the grass sat far below the scene). */}
      <Image source={source} resizeMode={resizeMode} style={styles.fill} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});
