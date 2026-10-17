import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { palette, radii, shadows, spacing, textStyle } from './theme';

export type CardTint = 'meadow' | 'sky' | 'warm';

export interface CardProps {
  children?: React.ReactNode;
  tint?: CardTint;
  title?: string;
  style?: StyleProp<ViewStyle>;
}

const TINTS: Record<CardTint, string> = {
  meadow: palette.meadowTint,
  sky: palette.skyTint,
  warm: palette.warmTint,
};

export function Card({ children, tint, title, style }: CardProps) {
  return (
    <View style={[styles.card, tint && { backgroundColor: TINTS[tint] }, style]}>
      {title && <Text style={[textStyle('h2'), styles.title]}>{title}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: radii.card,
    padding: spacing.lg,
    ...shadows.soft,
  },
  title: { marginBottom: spacing.sm },
});
