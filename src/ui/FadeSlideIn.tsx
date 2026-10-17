import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';

export const FADE_SLIDE_MS = 220;

export interface FadeSlideInProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Default 220 (fun review: transitions 200-300ms). */
  duration?: number;
}

/** Plays once on mount. Give it a changing `key` to replay per screen: <FadeSlideIn key={screen}>. Fills parent by default. */
export function FadeSlideIn({ children, style, duration = FADE_SLIDE_MS }: FadeSlideInProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [anim, duration]);

  return (
    <Animated.View
      style={[
        { flex: 1 },
        style,
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}
