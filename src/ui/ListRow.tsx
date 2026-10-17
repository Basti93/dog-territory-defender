import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ArtKey } from '../art/artAssets';
import { ArtImage } from './ArtImage';
import { PressableScale } from './PressableScale';
import { palette, radii, shadows, spacing, textStyle } from './theme';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Subtitle colour override (default muted). */
  subtitleColor?: string;
  icon?: ArtKey;
  onPress?: () => void;
  /** Hide the chevron (default shown when onPress is set). */
  hideChevron?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function ListRow({ title, subtitle, subtitleColor, icon, onPress, hideChevron, testID, style }: ListRowProps) {
  return (
    <PressableScale onPress={onPress} disabled={!onPress} testID={testID} style={[styles.row, style]}>
      {icon && <ArtImage art={icon} size={40} style={styles.icon} />}
      <View style={styles.text}>
        <Text style={textStyle('h2')} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={[textStyle('small'), { color: subtitleColor ?? palette.muted }]} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {onPress && !hideChevron && <Text style={[textStyle('h1'), { color: palette.muted }]}>›</Text>}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: palette.card,
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    ...shadows.soft,
  },
  icon: { marginRight: spacing.md },
  text: { flex: 1 },
});
