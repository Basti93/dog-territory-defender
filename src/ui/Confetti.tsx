import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import { ConfettiParticle, Rng, confettiTotalMs, generateConfettiParticles } from './confettiParticles';

export { generateConfettiParticles, seededRng } from './confettiParticles';

export interface ConfettiProps {
  /** Default 24. */
  count?: number;
  /** Injectable for deterministic layout. */
  rng?: Rng;
  /** Called once when every piece has landed; the component then renders nothing. */
  onDone?: () => void;
  style?: StyleProp<ViewStyle>;
}

function Piece({ p, fall }: { p: ConfettiParticle; fall: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.timing(anim, { toValue: 1, duration: p.durationMs, delay: p.delayMs, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [anim, p]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: `${p.x * 100}%`,
        width: p.sizePx,
        height: p.sizePx,
        borderRadius: 2,
        backgroundColor: p.color,
        opacity: anim.interpolate({ inputRange: [0, 0.05, 0.8, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, fall] }) },
          { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.driftPx] }) },
          { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rotateDeg}deg`] }) },
        ],
      }}
    />
  );
}

/** Gentle thank-you confetti. Fills its parent, ignores touches, unmounts itself via onDone. */
export function Confetti({ count, rng, onDone, style }: ConfettiProps) {
  const { height } = useWindowDimensions();
  // Held in a ref so an inline `rng` never regenerates the particles mid-flight.
  const rngRef = useRef(rng);
  rngRef.current = rng;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const particles = useMemo(() => generateConfettiParticles(count, rngRef.current), [count]);
  const [done, setDone] = React.useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => {
      setDone(true);
      onDoneRef.current?.();
    }, confettiTotalMs(particles) + 50);
    return () => clearTimeout(t);
  }, [particles]);

  if (done) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, style]}>
      {particles.map((p, i) => (
        <Piece key={i} p={p} fall={height * 0.6} />
      ))}
    </View>
  );
}
