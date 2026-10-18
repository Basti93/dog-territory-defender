import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { artOr } from '../../art/artAssets';
import { ArtImage } from '../../ui/ArtImage';
import { DecorImage } from '../../ui/DecorImage';
import { tokens } from '../../ui/tokens';

// Little effects for Buddy's rare idle tricks (weird streak). Each is mounted only while its trick plays and
// driven by ONE native-driver progress value (0..1) owned by BuddyAvatar, so there is nothing to clean up
// here. Token colours only; all of it is pointerEvents="none".

type Progress = Animated.Value;
const ramp = (p: Progress, input: number[], output: number[]) => p.interpolate({ inputRange: input, outputRange: output, extrapolate: 'clamp' });

const GLITTER = [tokens.warm, tokens.blue, tokens.green, tokens.meadow, tokens.white, tokens.warm];

/** Glitter sneeze: 6 tiny dots burst out of the nose. (x, y) = nose position in canvas px. */
export function SneezeFx({ progress, x, y, dir, size }: { progress: Progress; x: number; y: number; dir: 1 | -1; size: number }) {
  const reach = size * 0.24;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x, top: y, width: 0, height: 0 }}>
      {GLITTER.map((color, i) => {
        const angle = ((-50 + i * 20) * Math.PI) / 180; // fan out around the facing direction
        const dx = Math.cos(angle) * reach * dir;
        const dy = Math.sin(angle) * reach;
        return (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: color,
                opacity: ramp(progress, [0, 0.12, 0.7, 1], [0, 1, 0.9, 0]),
                transform: [{ translateX: ramp(progress, [0, 1], [0, dx]) }, { translateY: ramp(progress, [0, 1], [0, dy]) }, { scale: ramp(progress, [0, 0.2, 1], [0.4, 1.2, 0.6]) }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const LEAVES = [tokens.green, tokens.brown, tokens.warm, tokens.green, tokens.meadow];

/** Leaf tornado: 5 leaf dots circling Buddy while he spins. */
export function LeafFx({ progress, size }: { progress: Progress; size: number }) {
  const radius = size * 0.34;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: size / 2,
        top: size * 0.6,
        width: 0,
        height: 0,
        opacity: ramp(progress, [0, 0.1, 0.85, 1], [0, 1, 1, 0]),
        transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] }) }],
      }}
    >
      {LEAVES.map((color, i) => {
        const angle = (i * 2 * Math.PI) / LEAVES.length;
        return (
          <View
            key={i}
            style={[
              styles.leaf,
              { backgroundColor: color, left: Math.cos(angle) * radius - 5, top: Math.sin(angle) * radius * 0.7 - 3, transform: [{ rotate: `${i * 50}deg` }] },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

/** Head tilt with "?" -> lightbulb -> a bone pops up over the head. (x, y) = top-centre above the head. */
export function ThinkFx({ progress, x, y, size }: { progress: Progress; x: number; y: number; size: number }) {
  const box = Math.round(size * 0.24);
  const question = artOr('prop-question', null);
  const bulb = artOr('prop-lightbulb', null);
  const at = { position: 'absolute' as const, left: x - box / 2, top: y - box, width: box, height: box, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <>
      <Animated.View pointerEvents="none" style={[at, { opacity: ramp(progress, [0, 0.06, 0.34, 0.4], [0, 1, 1, 0]), transform: [{ translateY: ramp(progress, [0, 0.4], [4, -2]) }] }]}>
        {question ? (
          <DecorImage source={question} resizeMode="contain" style={{ width: box, height: box }} />
        ) : (
          <Text style={[styles.question, { fontSize: box * 0.9 }]}>?</Text>
        )}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[at, { opacity: ramp(progress, [0.34, 0.4, 0.62, 0.68], [0, 1, 1, 0]), transform: [{ scale: ramp(progress, [0.34, 0.44, 0.5], [0.6, 1.15, 1]) }] }]}>
        {bulb ? (
          <DecorImage source={bulb} resizeMode="contain" style={{ width: box, height: box }} />
        ) : (
          <>
            <View style={{ width: box * 0.62, height: box * 0.62, borderRadius: box * 0.31, backgroundColor: tokens.warm }} />
            <View style={{ width: box * 0.3, height: box * 0.16, borderRadius: 3, backgroundColor: tokens.brown, marginTop: 1 }} />
          </>
        )}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[at, { opacity: ramp(progress, [0.62, 0.7, 0.92, 1], [0, 1, 1, 0]), transform: [{ translateY: ramp(progress, [0.62, 0.78, 1], [6, -4, -8]) }, { scale: ramp(progress, [0.62, 0.74, 0.82], [0.3, 1.2, 1]) }] }]}>
        <ArtImage art="icon-treat" size={box} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  leaf: { position: 'absolute', width: 10, height: 6, borderRadius: 4 },
  question: { color: tokens.blue, fontWeight: '800' },
});
