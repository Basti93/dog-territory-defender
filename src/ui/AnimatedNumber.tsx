import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleProp, Text, TextStyle } from 'react-native';
import { countUpValue, formatCount } from './countUp';

export { countUpValue, formatCount } from './countUp';

export const MAX_COUNT_UP_MS = 1200;
export const DEFAULT_COUNT_UP_MS = 1000;

export interface AnimatedNumberProps {
  value: number;
  /** Start value for the first count-up. Omit to show `value` at once on mount. */
  from?: number;
  /** Clamped to 1200ms (fun review: tickers stay under 1.2s). Default 1000. */
  duration?: number;
  /** Decimal places (0 or 1 in practice). Ignored when `format` is given for display, still used for stepping. */
  decimals?: number;
  format?: (value: number) => string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

/**
 * Count-up ticker. JS-driven (text cannot use the native driver); state is set
 * only when the displayed value changes. Tapping the number jumps to the end.
 * Re-animates from the currently shown value whenever `value` changes.
 */
export function AnimatedNumber({
  value,
  from,
  duration = DEFAULT_COUNT_UP_MS,
  decimals = 0,
  format,
  style,
  accessibilityLabel,
}: AnimatedNumberProps) {
  const [shown, setShown] = useState<number>(from ?? value);
  const shownRef = useRef(shown);
  const progress = useRef(new Animated.Value(0)).current;
  const target = useRef(value);
  target.current = value;

  const show = (v: number) => {
    if (v !== shownRef.current) {
      shownRef.current = v;
      setShown(v);
    }
  };

  useEffect(() => {
    const start = shownRef.current;
    if (start === value) return;
    const ms = Math.min(MAX_COUNT_UP_MS, Math.max(0, duration));
    progress.setValue(0);
    const id = progress.addListener(({ value: p }) => show(countUpValue(start, value, p, undefined, decimals)));
    const anim = Animated.timing(progress, { toValue: 1, duration: ms, useNativeDriver: false });
    anim.start(({ finished }) => {
      if (finished) show(value);
    });
    return () => {
      anim.stop();
      progress.removeListener(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, decimals]);

  const skip = () => {
    progress.stopAnimation();
    show(target.current);
  };

  return (
    <Text style={style} onPress={skip} accessibilityLabel={accessibilityLabel}>
      {format ? format(shown) : formatCount(shown, decimals)}
    </Text>
  );
}
