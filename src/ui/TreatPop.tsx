import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleProp, TextStyle } from 'react-native';
import { formatTreatPop } from './treatPopFormat';
import { tokens } from './tokens';

export { formatTreatPop } from './treatPopFormat';

export const TREAT_POP_MS = 900;
export const TREAT_POP_RISE_PX = 40;

export interface TreatPopProps {
  amount: number;
  /** Default true. Plays when this turns true (and once on mount if true). */
  visible?: boolean;
  /** Change this value to replay (e.g. on a user action). Do NOT drive it from passive accrual ticks. */
  trigger?: unknown;
  emoji?: string | null;
  style?: StyleProp<TextStyle>;
}

/** Floats up and fades once per mount/visible/trigger; renders nothing at rest. Position it with `style`. */
export function TreatPop({ amount, visible = true, trigger, emoji = '🦴', style }: TreatPopProps) {
  const anim = useRef(new Animated.Value(0)).current;
  const [playing, setPlaying] = useState(false);
  const label = formatTreatPop(amount, emoji);

  useEffect(() => {
    if (!visible || !label) return;
    setPlaying(true);
    anim.setValue(0);
    const a = Animated.timing(anim, { toValue: 1, duration: TREAT_POP_MS, useNativeDriver: true });
    a.start(({ finished }) => {
      if (finished) setPlaying(false);
    });
    return () => a.stop();
    // label intentionally omitted: amount changes alone must not replay
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, trigger]);

  if (!playing) return null;
  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        { color: tokens.warm, fontSize: 16, fontWeight: '700' },
        style,
        {
          opacity: anim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -TREAT_POP_RISE_PX] }) }],
        },
      ]}
    >
      {label}
    </Animated.Text>
  );
}
