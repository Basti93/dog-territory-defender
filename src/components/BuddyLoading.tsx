import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { tokens } from '../ui';
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
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 24, gap: 8 },
  text: { textAlign: 'center', color: tokens.muted, fontSize: 14 },
});
