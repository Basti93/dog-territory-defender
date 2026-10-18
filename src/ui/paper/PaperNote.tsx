import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { material, mix } from '../theme';

export interface PaperNoteProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const WEAVE = mix(material.yarn, material.linen, 0.5);

/** Paper/linen note: cream, 2px darker edge, faint weave lines, no drop shadow. Text on it should be `material.ink`. */
export function PaperNote({ children, style, testID }: PaperNoteProps) {
  return (
    <View style={[styles.note, style]} testID={testID}>
      <View pointerEvents="none" style={styles.weave} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    backgroundColor: material.yarn,
    borderWidth: 2,
    borderColor: material.linen,
    borderRadius: 8,
    padding: 12,
    overflow: 'hidden',
  },
  // A single faint inner frame stands in for the weave until the linen pattern PNG exists.
  weave: { ...StyleSheet.absoluteFillObject, margin: 3, borderWidth: 1, borderColor: WEAVE, borderRadius: 5 },
});
