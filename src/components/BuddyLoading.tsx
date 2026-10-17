import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { palette, spacing, textStyle } from '../ui';
import { BuddyAvatar } from './buddy';

// Calm loading / empty-state block: a small idle Buddy above one line of text.
// Never on the live walk map (phone-in-pocket rule).
interface BuddyLoadingProps {
  appearance: BuddyAppearance;
  text: string;
}

export function BuddyLoading({ appearance, text }: BuddyLoadingProps) {
  return (
    <View style={styles.wrap}>
      <BuddyAvatar appearance={appearance} size={72} mood="idle" />
      <Text style={[textStyle('body'), styles.text]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: spacing.xl, paddingHorizontal: spacing.xl, gap: spacing.sm, backgroundColor: palette.background },
  text: { textAlign: 'center', color: palette.muted },
});
