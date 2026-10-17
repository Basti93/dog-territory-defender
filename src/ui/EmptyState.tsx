import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { palette, spacing, textStyle } from './theme';

export interface EmptyStateProps {
  title: string;
  /** One warm line, no guilt ("Your first walk will land here"). */
  message?: string;
  /** Buddy slot, e.g. <BuddyAvatar .../>. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ title, message, children, style }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, style]}>
      {children}
      <Text style={[textStyle('h1'), styles.title]}>{title}</Text>
      {message && <Text style={[textStyle('body'), styles.msg]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  title: { textAlign: 'center', marginTop: spacing.lg },
  msg: { textAlign: 'center', color: palette.muted, marginTop: spacing.sm },
});
