import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { palette } from '../ui';

/** Only touches that begin this close to the left edge can start the swipe. */
export const EDGE_ZONE_PX = 24;
/** Release past this share of the screen width commits the swipe. */
export const COMMIT_FRACTION = 0.35;
/** ...or a rightward fling faster than this (px/ms). */
export const COMMIT_VELOCITY = 0.5;
const SLIDE_OUT_MS = 180;

/** Pure release decision, exported for tests. */
export function shouldCommitSwipe(dx: number, vx: number, width: number): boolean {
  return dx > width * COMMIT_FRACTION || vx > COMMIT_VELOCITY;
}

/** A drag that starts a swipe: moving right, more sideways than vertical. */
export function isRightwardDrag(dx: number, dy: number): boolean {
  return dx > 6 && Math.abs(dx) > Math.abs(dy);
}

interface EdgeSwipeBackProps {
  /** Same action as the hardware back. Return false to refuse (the screen springs back). */
  onBack: () => boolean | void;
  /** Defaults to iOS only: Android has the system back gesture, and its edge zone must stay free for it. */
  enabled?: boolean;
  children: React.ReactNode;
}

/**
 * iOS swipe-back: a transparent 24 px strip on the left edge, ABOVE the content (so a WebView underneath, the map,
 * never sees touches that start there and still pans everywhere else). Only a rightward drag claims the touch; a tap on
 * the strip is a no-op. The screen follows the finger with a translateX only (no opacity: Android WebViews inside an
 * animating-opacity parent can render blank, see navigation.ts screenKey). Give it a `key` per screen so a committed
 * swipe (screen stays slid off) never leaks into the next screen.
 */
export function EdgeSwipeBack({ onBack, enabled = Platform.OS === 'ios', children }: EdgeSwipeBackProps) {
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const widthRef = useRef(width);
  widthRef.current = width;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const springBack = () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Never claim on touch start: only a deliberate rightward drag from the edge becomes the swipe.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (evt, g) => g.x0 <= EDGE_ZONE_PX && isRightwardDrag(g.dx, g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_evt, g) => translateX.setValue(Math.max(0, g.dx)),
        onPanResponderRelease: (_evt, g) => {
          if (!shouldCommitSwipe(g.dx, g.vx, widthRef.current)) return springBack();
          Animated.timing(translateX, { toValue: widthRef.current, duration: SLIDE_OUT_MS, useNativeDriver: true }).start(({ finished }) => {
            if (!finished || !mounted.current) return;
            if (onBackRef.current() === false) springBack();
            // The usual outcome is a different screen (new key, this wrapper unmounts). If the same screen stays
            // (back was handled in place), slide it back in so it is never stuck off-screen.
            else setTimeout(() => mounted.current && springBack(), 120);
          });
        },
        onPanResponderTerminate: () => springBack(),
      }),
    // springBack only touches stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [translateX]
  );

  if (!enabled) return <>{children}</>;
  return (
    <Animated.View style={[styles.fill, { transform: [{ translateX }] }]}>
      {children}
      <View testID="edge-swipe-zone" style={styles.zone} {...panResponder.panHandlers} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: palette.background },
  zone: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE_ZONE_PX, backgroundColor: 'transparent' },
});
