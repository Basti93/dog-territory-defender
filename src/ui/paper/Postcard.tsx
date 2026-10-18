import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { material, textStyle } from '../theme';
import { PaperNote } from './PaperNote';

export interface PostcardProps {
  side: 'front' | 'back';
  /** Front: picture/scene content inside a thin frame. */
  children?: React.ReactNode;
  /** Back: hand-written lines (Caveat). */
  lines?: string[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Postcard. Front = framed content area; back = hand-written lines. */
export function Postcard({ side, children, lines = [], style, testID }: PostcardProps) {
  if (side === 'front') {
    return (
      <PaperNote style={[styles.card, style]} testID={testID}>
        <View style={styles.frame}>{children}</View>
      </PaperNote>
    );
  }
  return (
    <PaperNote style={[styles.card, style]} testID={testID}>
      {lines.map((line, i) => (
        <Text key={i} style={[textStyle('hand'), styles.line]}>
          {line}
        </Text>
      ))}
      {children}
    </PaperNote>
  );
}

const styles = StyleSheet.create({
  card: { padding: 10 },
  frame: { borderWidth: 1, borderColor: material.woodRim, borderRadius: 4, overflow: 'hidden', minHeight: 80 },
  line: { color: material.ink, borderBottomWidth: 1, borderBottomColor: material.linen },
});
