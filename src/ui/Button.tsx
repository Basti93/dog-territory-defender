import React from 'react';
import { StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { ArtKey } from '../art/artAssets';
import { ArtImage } from './ArtImage';
import { PressableScale } from './PressableScale';
import { palette, radii, shadows, spacing, textStyle, tokens } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Art key shown left of the label (24px). */
  icon?: ArtKey;
  /** Soft breathing glow (stops after ~10s or first touch). */
  pulse?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** Override the label colour (e.g. tokens.warm for a gentle destructive action). */
  labelColor?: string;
  /** Press sound + haptic. Default 'tap' for primary/secondary, 'none' for ghost. */
  feedback?: 'tap' | 'none';
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  pulse,
  disabled,
  accessibilityLabel,
  testID,
  style,
  labelColor: labelColorProp,
  feedback = variant === 'ghost' ? 'none' : 'tap',
}: ButtonProps) {
  const labelColor = labelColorProp ?? (variant === 'primary' ? palette.background : palette.greenText);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      pulse={pulse}
      feedback={feedback}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={[styles.base, variantStyles[variant], style]}
    >
      {icon && <ArtImage art={icon} size={24} style={styles.icon} />}
      <Text style={[textStyle('h2'), { color: labelColor }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { marginRight: spacing.sm },
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: tokens.green, ...shadows.card },
  secondary: { backgroundColor: palette.background, borderWidth: 2, borderColor: palette.border },
  ghost: { backgroundColor: 'transparent' },
};
