import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { material, textStyle } from '../theme';

export interface SpeechBubbleProps {
  children?: React.ReactNode;
  /** Which side the tail sits on. Default 'left' (Buddy below-left). */
  tail?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Small cream bubble with a tail, for Buddy lines. Strings render in `body` style, ink colour. */
export function SpeechBubble({ children, tail = 'left', style, testID }: SpeechBubbleProps) {
  const content =
    typeof children === 'string' ? <Text style={[textStyle('body') as TextStyle, styles.text]}>{children}</Text> : children;
  return (
    <View style={style} testID={testID}>
      <View style={styles.bubble}>{content}</View>
      <View style={[styles.tail, tail === 'left' ? { left: 18 } : { right: 18 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: material.yarn,
    borderWidth: 2,
    borderColor: material.woodRim,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: { color: material.ink },
  // Rotated square half-hidden under the bubble edge forms the tail.
  tail: {
    position: 'absolute',
    bottom: -7,
    width: 12,
    height: 12,
    backgroundColor: material.yarn,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: material.woodRim,
    transform: [{ rotate: '45deg' }],
  },
});
