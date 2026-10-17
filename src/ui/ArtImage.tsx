import React from 'react';
import { Image, ImageStyle, StyleProp, View, ViewStyle } from 'react-native';
import { ArtKey, artAssets } from '../art/artAssets';
import { palette } from './theme';

export interface ArtImageProps {
  art: ArtKey;
  /** Square size in px. Default 32. */
  size?: number;
  /** Optional non-square override. */
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
}

/** Sprite by key. Always contain-fit with explicit size; rounded placeholder if the PNG is missing. */
export function ArtImage({ art, size = 32, width, height, style }: ArtImageProps) {
  const w = width ?? size;
  const h = height ?? size;
  const source = artAssets[art];
  if (!source) {
    return (
      <View
        style={[{ width: w, height: h, borderRadius: Math.min(w, h) * 0.3, backgroundColor: palette.meadowTint } as ViewStyle]}
      />
    );
  }
  return (
    <Image
      source={source}
      resizeMode="contain"
      style={[{ width: w, height: h }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
