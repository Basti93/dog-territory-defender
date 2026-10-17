import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ArtKey } from '../art/artAssets';
import { ArtImage } from './ArtImage';
import { PressableScale } from './PressableScale';
import { palette, shadows, spacing, textStyle } from './theme';
import { t } from '../i18n';

export interface HeaderProps {
  title: string;
  /** Art key for a small leading icon (28-32px). */
  icon?: ArtKey;
  /** Renders the round clay back button when provided. */
  onBack?: () => void;
  /** Right-aligned slot (Chip, icon button...). */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Header({ title, icon, onBack, right, style }: HeaderProps) {
  return (
    <View style={[styles.row, style]}>
      {onBack && (
        <PressableScale
          onPress={onBack}
          accessibilityLabel={t('common.back')}
          style={styles.back}
          hitSlop={8}
        >
          <Text style={[textStyle('h1'), styles.chevron]}>‹</Text>
        </PressableScale>
      )}
      {icon && <ArtImage art={icon} size={32} style={styles.icon} />}
      <Text style={[textStyle('display'), styles.title]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.soft,
  },
  chevron: { lineHeight: 30, marginTop: -2 },
  icon: { marginRight: spacing.sm },
  title: { flex: 1 },
});
