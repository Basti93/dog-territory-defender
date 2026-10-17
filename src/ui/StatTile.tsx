import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ArtKey } from '../art/artAssets';
import { AnimatedNumber } from './AnimatedNumber';
import { ArtImage } from './ArtImage';
import { palette, radii, shadows, spacing, textStyle } from './theme';

export interface StatTileProps {
  value: number;
  label: string;
  icon?: ArtKey;
  decimals?: number;
  /** Custom display, e.g. (v) => `${v.toFixed(1)} km`. */
  format?: (value: number) => string;
  style?: StyleProp<ViewStyle>;
}

export function StatTile({ value, label, icon, decimals, format, style }: StatTileProps) {
  return (
    <View style={[styles.tile, style]}>
      {icon && <ArtImage art={icon} size={32} style={styles.icon} />}
      <AnimatedNumber value={value} decimals={decimals} format={format} style={[textStyle('display'), styles.value]} />
      <Text style={[textStyle('small'), { color: palette.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: palette.card,
    borderRadius: radii.tile,
    padding: spacing.lg,
    alignItems: 'center',
    flexGrow: 1,
    ...shadows.soft,
  },
  icon: { marginBottom: spacing.xs },
  value: { textAlign: 'center' },
});
