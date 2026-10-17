import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { ArtKey, artOr } from '../../art/artAssets';

// Den upgrade-card icon. Shows the generated PNG once `artKey` is registered in
// src/art/artAssets.ts, otherwise a drawn rounded badge in the building's colours.
interface CardIconProps {
  artKey: ArtKey;
  color: string;
  lightColor: string;
}

export function CardIcon({ artKey, color, lightColor }: CardIconProps) {
  const art = artOr(artKey, null);
  if (art) {
    return <Image source={art} style={styles.icon} resizeMode="contain" />;
  }
  return (
    <View style={[styles.icon, styles.fallback, { backgroundColor: lightColor, borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 44, height: 44 },
  fallback: {
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 16, height: 16, borderRadius: 8, opacity: 0.85 },
});
