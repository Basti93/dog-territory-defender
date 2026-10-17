import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ArtKey } from '../art/artAssets';
import { ArtImage } from './ArtImage';
import { palette, radii, spacing, textStyle } from './theme';

export interface ChipProps {
  label: string;
  /** Art key, e.g. 'icon-treat' for a treats count. */
  icon?: ArtKey;
  tint?: 'meadow' | 'sky' | 'warm';
  style?: StyleProp<ViewStyle>;
}

const TINTS = { meadow: palette.meadowTint, sky: palette.skyTint, warm: palette.warmTint };

export function Chip({ label, icon, tint = 'meadow', style }: ChipProps) {
  return (
    <View style={[styles.chip, { backgroundColor: TINTS[tint] }, style]}>
      {icon && <ArtImage art={icon} size={18} style={styles.icon} />}
      <Text style={textStyle('small')}>{label}</Text>
    </View>
  );
}

/** Same component; name for call sites that read better as a badge. */
export const Badge = Chip;

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  icon: { marginRight: spacing.xs + 2 },
});
