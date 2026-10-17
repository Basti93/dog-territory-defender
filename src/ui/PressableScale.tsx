import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityRole,
  Animated,
  GestureResponderEvent,
  Insets,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { tokens } from './tokens';

export const PRESSED_SCALE = 0.96;
export const PULSE_MAX_MS = 10000;

// Style keys that position/size the button inside its parent. They go on the
// outer Pressable; everything else (background, border, padding, ...) stays on
// the inner scaled Animated.View.
const LAYOUT_KEY_PATTERN =
  /^(flex|flexGrow|flexShrink|flexBasis|alignSelf|margin.*|position|top|left|right|bottom|start|end|width|height|minWidth|maxWidth|minHeight|maxHeight|zIndex|aspectRatio)$/;

function splitStyle(style: StyleProp<ViewStyle>): { layout: ViewStyle; visual: ViewStyle } {
  const layout: Record<string, unknown> = {};
  const visual: Record<string, unknown> = {};
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(flat)) {
    (LAYOUT_KEY_PATTERN.test(key) ? layout : visual)[key] = flat[key];
  }
  return { layout: layout as ViewStyle, visual: visual as ViewStyle };
}

export interface PressableScaleProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  testID?: string;
  hitSlop?: number | Insets;
  /** Slow soft glow/breathe. Stops by itself after ~10s or on first touch. */
  pulse?: boolean;
}

export function PressableScale({
  children,
  style,
  disabled,
  onPress,
  onLongPress,
  accessibilityRole = 'button',
  accessibilityLabel,
  testID,
  hitSlop,
  pulse = false,
}: PressableScaleProps) {
  const press = useRef(new Animated.Value(1)).current;
  const breathe = useRef(new Animated.Value(0)).current; // 0..1
  const [pulsing, setPulsing] = useState(pulse);

  useEffect(() => {
    setPulsing(pulse);
  }, [pulse]);

  useEffect(() => {
    if (!pulsing) {
      breathe.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ])
    );
    loop.start();
    const stopTimer = setTimeout(() => setPulsing(false), PULSE_MAX_MS);
    return () => {
      loop.stop();
      clearTimeout(stopTimer);
    };
  }, [pulsing, breathe]);

  const springTo = useCallback(
    (toValue: number) => {
      Animated.spring(press, { toValue, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
    },
    [press]
  );

  useEffect(() => () => press.stopAnimation(), [press]);

  const breatheScale = useMemo(() => breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }), [breathe]);
  const glowOpacity = useMemo(() => breathe.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }), [breathe]);
  const scale = useMemo(() => Animated.multiply(press, breatheScale), [press, breatheScale]);
  const { layout, visual } = splitStyle(style);
  const radius = visual.borderRadius ?? 12;

  return (
    <Pressable
      style={layout}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => {
        if (pulsing) setPulsing(false);
        springTo(PRESSED_SCALE);
      }}
      onPressOut={() => springTo(1)}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
    >
      {/* Disabled dimming lives on a wrapper so it multiplies with, rather than replaces, a caller's own opacity. */}
      <View style={[styles.fill, disabled && styles.disabled]}>
        <Animated.View style={[styles.fill, visual, { transform: [{ scale }] }]}>
          {pulsing && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                { borderRadius: radius, backgroundColor: tokens.meadow, opacity: glowOpacity },
              ]}
            />
          )}
          {children}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Lets a flex/height given to the outer Pressable pass through to the visual box.
  fill: { flexGrow: 1 },
  disabled: { opacity: 0.5 },
});
