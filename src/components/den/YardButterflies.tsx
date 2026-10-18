import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { tokens } from '../../ui/tokens';

// Two slow butterflies over a stage-3 Sniff Garden. Presentation only. Two animated nodes (one per
// butterfly), native driver, each a single 0..1 progress value interpolated into drifting x / y /
// tilt paths (different periods per axis, so the loop never looks mechanical). Loops stop on unmount.

interface Props {
  /** The garden sprite's box (px; `bottom` measured up from the yard floor). */
  garden: { left: number; bottom: number; size: number };
}

const BUTTERFLIES = [
  { loopMs: 9000, x: 0.3, y: 0.66, color: tokens.blue, dx: [0, 22, 6, -18, 0], dy: [0, -10, 4, -14, 2, 0], tilt: [-8, 8, -6, 6, -8] },
  { loopMs: 11500, x: 0.62, y: 0.78, color: tokens.warm, dx: [0, -20, -4, 20, 0], dy: [0, 8, -12, 4, -6, 0], tilt: [6, -8, 8, -6, 6] },
] as const;

export function YardButterflies({ garden }: Props) {
  return (
    <>
      {BUTTERFLIES.map((b, i) => (
        <Butterfly key={i} spec={b} left={garden.left + garden.size * b.x} bottom={garden.bottom + garden.size * b.y} />
      ))}
    </>
  );
}

function Butterfly({ spec, left, bottom }: { spec: (typeof BUTTERFLIES)[number]; left: number; bottom: number }) {
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    p.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: spec.loopMs, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 1, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [p, spec.loopMs]);

  const steps = (n: number) => Array.from({ length: n }, (_, k) => k / (n - 1));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          left,
          bottom,
          transform: [
            { translateX: p.interpolate({ inputRange: steps(spec.dx.length), outputRange: [...spec.dx] }) },
            { translateY: p.interpolate({ inputRange: steps(spec.dy.length), outputRange: [...spec.dy] }) },
            { rotate: p.interpolate({ inputRange: steps(spec.tilt.length), outputRange: spec.tilt.map((d) => `${d}deg`) }) },
          ],
        },
      ]}
    >
      <View style={[styles.wing, { backgroundColor: spec.color, left: 0, transform: [{ rotate: '-28deg' }] }]} />
      <View style={[styles.wing, { backgroundColor: spec.color, left: 9, transform: [{ rotate: '28deg' }] }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', width: 22, height: 16 },
  wing: { position: 'absolute', top: 0, width: 12, height: 16, borderRadius: 8, opacity: 0.9 },
});
