import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';

import { ArtKey, artOr } from '../../art/artAssets';
import { DecorImage } from '../../ui/DecorImage';
import { tokens } from '../../ui/tokens';
import type { YardLayout } from './YardScene';
import { WILD_EXTRA_MS, WildExtraId } from './wildExtras';

// Wild Extras: rare, cosmetic yard cameos (weird streak). Each is ONE native-driver progress value `p`
// (0..1 over WILD_EXTRA_MS[id], <= 6 s) that every moving part reads through interpolations, so there is
// one animation to stop on unmount and no timers at all. Looping-free, pointerEvents="none", no rewards.
// Props use the PNG when it is registered (artOr) and a drawn fallback from Design Tokens otherwise.
// Beams only lift, glow, deliver: never a weapon, never a scare for Buddy.

interface Props {
  id: WildExtraId;
  layout: YardLayout;
  width: number;
  height: number;
  /** Called once when the choreography has played to the end (not when it is cut off by unmount). */
  onDone: () => void;
}

type P = Animated.Value;
type Key = readonly [number, number];
type Num = Animated.AnimatedInterpolation<number>;

const track = (p: P, keys: readonly Key[]): Num =>
  p.interpolate({ inputRange: keys.map((k) => k[0]), outputRange: keys.map((k) => k[1]), extrapolate: 'clamp' });
const trackDeg = (p: P, keys: readonly Key[]) =>
  p.interpolate({ inputRange: keys.map((k) => k[0]), outputRange: keys.map((k) => `${k[1]}deg`), extrapolate: 'clamp' });
/** 0 -> peak -> 0 opacity ramp. */
const fade = (p: P, inAt: number, inEnd: number, outAt: number, outEnd: number, peak = 1): Num =>
  track(p, [[0, 0], [inAt, 0], [inEnd, peak], [outAt, peak], [outEnd, 0], [1, 0]]);
/** `count` bumps of height `amp` between `start` and `end`, flat elsewhere. */
function pulses(start: number, end: number, count: number, amp: number): Key[] {
  const keys: Key[] = [[0, 0], [start, 0]];
  const step = (end - start) / (count * 2);
  for (let i = 1; i <= count * 2; i++) keys.push([start + step * i, i % 2 === 1 ? amp : 0]);
  keys.push([1, 0]);
  return keys;
}

function At({
  left,
  top,
  width,
  height,
  opacity,
  transform,
  children,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  opacity?: Num | number;
  transform?: ViewStyle['transform'];
  children?: React.ReactNode;
}) {
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left, top, width, height, opacity, transform } as never}>
      {children}
    </Animated.View>
  );
}

/** The sprite when it exists, else the drawn fallback (laid out in the same box). */
function Prop({ art, width, height, fallback }: { art: ArtKey; width: number; height: number; fallback: React.ReactNode }) {
  const source = artOr(art, null);
  return <View style={{ width, height }}>{source ? <DecorImage source={source} resizeMode="contain" style={{ width, height }} /> : fallback}</View>;
}

const abs = (style: ViewStyle): ViewStyle => ({ position: 'absolute', ...style });

export function YardExtras({ id, layout, width, height, onDone }: Props) {
  const p = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    p.setValue(0);
    const anim = Animated.timing(p, { toValue: 1, duration: WILD_EXTRA_MS[id], easing: Easing.linear, useNativeDriver: true });
    anim.start(({ finished }) => {
      if (finished) doneRef.current();
    });
    return () => anim.stop();
  }, [id, p]);

  return (
    <View testID={`wild-extra-${id}`} pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 6 }]}>
      <Scene id={id} p={p} layout={layout} width={width} height={height} />
    </View>
  );
}

interface SceneProps {
  p: P;
  layout: YardLayout;
  width: number;
  height: number;
}

function Scene({ id, ...rest }: SceneProps & { id: WildExtraId }) {
  switch (id) {
    case 'daisy-abduction':
      return <DaisyAbduction {...rest} />;
    case 'moon-cheese':
      return <MoonCheese {...rest} />;
    case 'rain-squirrel':
      return <RainSquirrel {...rest} />;
    case 'bone-comet':
      return <BoneComet {...rest} />;
    case 'mailbox-periscope':
      return <MailboxPeriscope {...rest} />;
    case 'duck-parade':
      return <DuckParade {...rest} />;
    case 'level-up-fireflies':
      return <Fireflies {...rest} />;
    case 'tea-time':
      return <TeaTime {...rest} />;
  }
}

// ----- 1. Daisy abduction: UFO lifts one daisy from the Hof lawn with a glowing beam, bows, sets it back -----
function DaisyAbduction({ p, layout, height }: SceneProps) {
  const gx = layout.extras.daisyCx;
  const ufoTop = height * 0.2;
  const daisyTop = height * 0.8;
  const lift = daisyTop - ufoTop - 36;
  const beamTop = ufoTop + 30;
  return (
    <>
      <At left={gx - 24} top={beamTop} width={48} height={daisyTop - beamTop + 8} opacity={fade(p, 0.18, 0.26, 0.8, 0.88, 0.45)}>
        <Prop art="prop-beam" width={48} height={daisyTop - beamTop + 8} fallback={<View style={[StyleSheet.absoluteFill, styles.beam]} />} />
      </At>
      <At left={gx - 10} top={daisyTop} width={20} height={20} opacity={fade(p, 0.1, 0.16, 0.9, 0.96)} transform={[{ translateY: track(p, [[0, 0], [0.28, 0], [0.46, -lift], [0.7, -lift], [0.84, 0], [1, 0]]) }]}>
        <View style={styles.daisy}>
          <View style={styles.daisyCentre} />
        </View>
      </At>
      <At
        left={gx - 30}
        top={ufoTop}
        width={60}
        height={42}
        opacity={fade(p, 0, 0.1, 0.88, 0.98)}
        transform={[{ translateY: track(p, [[0, -80], [0.12, 0], [0.86, 0], [1, -80]]) }, { rotate: trackDeg(p, [[0, 0], [0.58, 0], [0.64, 16], [0.7, 0], [1, 0]]) }]}
      >
        <Prop
          art="prop-ufo"
          width={60}
          height={42}
          fallback={
            <>
              <View style={abs({ left: 17, top: 0, width: 26, height: 22, borderRadius: 13, backgroundColor: tokens.white, borderColor: tokens.blue, borderWidth: 2 })} />
              <View style={abs({ left: 0, top: 14, width: 60, height: 22, borderRadius: 11, backgroundColor: tokens.blue })} />
              {[10, 27, 44].map((x) => (
                <View key={x} style={abs({ left: x, top: 22, width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.warm })} />
              ))}
            </>
          }
        />
      </At>
    </>
  );
}

// ----- 2. Moon-cheese cameo: the moon shows cheese holes for a few seconds, winks, fades out -----
function MoonCheese({ p, width }: SceneProps) {
  const blinkKeys = (low: number): Key[] => [[0, 1], [0.42, 1], [0.46, low], [0.5, 1], [0.58, 1], [0.62, low], [0.66, 1], [1, 1]];
  return (
    <At left={width - 88} top={36} width={64} height={64} opacity={fade(p, 0, 0.16, 0.84, 1, 0.95)} transform={[{ scaleY: track(p, blinkKeys(0.9)) }]}>
      <Prop
        art="prop-moon-cheese"
        width={64}
        height={64}
        fallback={
          <>
            <View style={abs({ left: 0, top: 0, width: 64, height: 64, borderRadius: 32, backgroundColor: tokens.meadow })} />
            <View style={abs({ left: 40, top: 10, width: 12, height: 12, borderRadius: 6, backgroundColor: tokens.warm, opacity: 0.55 })} />
            <View style={abs({ left: 12, top: 38, width: 16, height: 16, borderRadius: 8, backgroundColor: tokens.warm, opacity: 0.55 })} />
            <View style={abs({ left: 44, top: 42, width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.warm, opacity: 0.55 })} />
            <View style={abs({ left: 20, top: 22, width: 5, height: 8, borderRadius: 3, backgroundColor: tokens.brown })} />
            <Animated.View style={abs({ left: 38, top: 22, width: 5, height: 8, borderRadius: 3, backgroundColor: tokens.brown, transform: [{ scaleY: track(p, blinkKeys(0.1)) }] } as never)} />
          </>
        }
      />
    </At>
  );
}

// ----- 3. Rain-dance squirrel: slides along the fence line, umbrella routine with bobs, slides off -----
function RainSquirrel({ p, layout, width }: SceneProps) {
  const top = layout.ground.horizonY - 44;
  const stopX = width * 0.3;
  return (
    <At
      left={0}
      top={top}
      width={48}
      height={48}
      opacity={fade(p, 0, 0.06, 0.94, 1)}
      transform={[{ translateX: track(p, [[0, -60], [0.22, stopX], [0.78, stopX], [1, width + 60]]) }, { translateY: track(p, pulses(0.26, 0.74, 5, -4)) }]}
    >
      <Prop
        art="prop-squirrel-raincoat"
        width={48}
        height={48}
        fallback={
          <>
            <View style={abs({ left: 28, top: 20, width: 14, height: 26, borderRadius: 8, backgroundColor: tokens.warm })} />
            <View style={abs({ left: 12, top: 22, width: 18, height: 24, borderRadius: 9, backgroundColor: tokens.brown })} />
            <Animated.View style={abs({ left: 2, top: 4, width: 40, height: 18, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: tokens.blue, transform: [{ rotate: trackDeg(p, pulses(0.26, 0.74, 3, 12)) }] } as never)} />
          </>
        }
      />
    </At>
  );
}

// ----- 4. Bone comet: arcs across the sky with a fading trail of 3 dots -----
function BoneComet({ p, width }: SceneProps) {
  const arc = (lag: number): { x: Key[]; y: Key[]; a: Key[] } => {
    const x: Key[] = [[0, -50]];
    const y: Key[] = [[0, 110]];
    const a: Key[] = [[0, -30]];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const time = lag + t * 0.8;
      x.push([time, -50 + t * (width + 100)]);
      y.push([time, 110 - 80 * 4 * t * (1 - t)]);
      a.push([time, -35 + 70 * t]);
    }
    x.push([1, width + 50]);
    y.push([1, 110]);
    a.push([1, 35]);
    return { x, y, a };
  };
  const trail = [
    { lag: 0.03, size: 10, opacity: 0.7 },
    { lag: 0.06, size: 8, opacity: 0.5 },
    { lag: 0.09, size: 6, opacity: 0.3 },
  ];
  const head = arc(0);
  return (
    <>
      {trail.map((d) => {
        const path = arc(d.lag);
        return (
          <At key={d.lag} left={0} top={0} width={d.size} height={d.size} opacity={fade(p, d.lag, d.lag + 0.04, d.lag + 0.72, d.lag + 0.8, d.opacity)} transform={[{ translateX: track(p, path.x) }, { translateY: track(p, path.y) }]}>
            <View style={{ width: d.size, height: d.size, borderRadius: d.size / 2, backgroundColor: tokens.warm }} />
          </At>
        );
      })}
      <At left={0} top={0} width={40} height={20} opacity={fade(p, 0, 0.04, 0.72, 0.8)} transform={[{ translateX: track(p, head.x) }, { translateY: track(p, head.y) }, { rotate: trackDeg(p, head.a) }]}>
        <Prop
          art="prop-comet-bone"
          width={40}
          height={20}
          fallback={
            <>
              <View style={abs({ left: 6, top: 5, width: 28, height: 10, borderRadius: 5, backgroundColor: tokens.white, borderColor: tokens.brown, borderWidth: 1.5 })} />
              {[[0, 1], [0, 9], [30, 1], [30, 9]].map(([x, y]) => (
                <View key={`${x}-${y}`} style={abs({ left: x, top: y, width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.white, borderColor: tokens.brown, borderWidth: 1.5 })} />
              ))}
            </>
          }
        />
      </At>
    </>
  );
}

// ----- 5. Mailbox periscope: mailbox pops up at the yard edge, periscope rises, one soggy sock drops -----
function MailboxPeriscope({ p, height }: SceneProps) {
  const top = height * 0.7;
  return (
    <At left={10} top={top} width={64} height={64} opacity={fade(p, 0, 0.08, 0.9, 0.98)} transform={[{ scale: track(p, [[0, 0.2], [0.1, 1.12], [0.16, 1], [1, 1]]) }]}>
      {/* periscope first, so the mailbox body hides its foot */}
      <Animated.View style={abs({ left: 28, top: 0, width: 16, height: 40, transform: [{ translateY: track(p, [[0, 26], [0.22, 26], [0.36, 0], [0.74, 0], [0.86, 26], [1, 26]]) }] } as never)}>
        <View style={abs({ left: 5, top: 6, width: 5, height: 34, backgroundColor: tokens.brown, borderRadius: 2 })} />
        <View style={abs({ left: 0, top: 0, width: 16, height: 8, borderRadius: 4, backgroundColor: tokens.blue })} />
      </Animated.View>
      <Prop
        art="prop-mailbox"
        width={64}
        height={64}
        fallback={
          <>
            <View style={abs({ left: 18, top: 36, width: 8, height: 28, backgroundColor: tokens.brown, borderRadius: 3 })} />
            <View style={abs({ left: 4, top: 22, width: 38, height: 24, borderRadius: 12, backgroundColor: tokens.blue })} />
            <View style={abs({ left: 38, top: 14, width: 5, height: 14, backgroundColor: tokens.warm, borderRadius: 2 })} />
          </>
        }
      />
      <Animated.View
        style={abs({
          left: 46,
          top: 14,
          width: 14,
          height: 20,
          opacity: fade(p, 0.4, 0.42, 0.88, 0.96),
          transform: [{ translateY: track(p, [[0, 0], [0.4, 0], [0.54, 34], [0.58, 30], [0.62, 34], [1, 34]]) }, { rotate: trackDeg(p, [[0, -20], [0.4, -20], [0.54, 10], [0.7, -6], [1, -6]]) }],
        } as never)}
      >
        <Prop
          art="prop-sock"
          width={14}
          height={20}
          fallback={
            <>
              <View style={abs({ left: 1, top: 4, width: 12, height: 15, borderRadius: 5, backgroundColor: tokens.blue })} />
              <View style={abs({ left: 1, top: 0, width: 12, height: 5, borderRadius: 2, backgroundColor: tokens.white })} />
            </>
          }
        />
      </Animated.View>
    </At>
  );
}

// ----- 6. Duck parade: three ducks in party hats march left to right across the lawn -----
function DuckParade({ p, layout, width }: SceneProps) {
  const top = layout.extras.duckBaseY - 34;
  return (
    <>
      {[0, 0.07, 0.14].map((lag) => (
        <At
          key={lag}
          left={0}
          top={top}
          width={36}
          height={36}
          transform={[{ translateX: track(p, [[0, -50], [lag, -50], [lag + 0.7, width + 50], [1, width + 50]]) }, { translateY: track(p, pulses(lag, lag + 0.7, 10, -4)) }]}
        >
          <Prop
            art="prop-duck-party"
            width={36}
            height={36}
            fallback={
              <>
                <View style={abs({ left: 3, top: 16, width: 26, height: 18, borderRadius: 9, backgroundColor: tokens.warm })} />
                <View style={abs({ left: 20, top: 8, width: 13, height: 13, borderRadius: 7, backgroundColor: tokens.warm })} />
                <View style={abs({ left: 31, top: 13, width: 6, height: 4, borderRadius: 2, backgroundColor: tokens.brown })} />
                <View style={abs({ left: 22, top: -4, width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 12, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: tokens.blue })} />
              </>
            }
          />
        </At>
      ))}
    </>
  );
}

// ----- 7. Level-up fireflies: 8 glowing dots converge into a rough dog face, then scatter -----
const FACE: ReadonlyArray<readonly [number, number]> = [
  [-34, -30], [34, -30], // ears
  [-14, -6], [14, -6], // eyes
  [0, 10], // nose
  [-12, 24], [0, 28], [12, 24], // smile
];
const FIREFLY_START: ReadonlyArray<readonly [number, number]> = [
  [-120, -40], [120, -60], [-90, 50], [100, 40], [-30, -90], [40, 80], [-140, 10], [140, -10],
];
const FIREFLY_SCATTER: ReadonlyArray<readonly [number, number]> = [
  [-150, -70], [150, -90], [-120, 70], [130, 70], [-40, -110], [60, 100], [-170, 0], [170, 20],
];

function Fireflies({ p, layout, width, height }: SceneProps) {
  const cx = Math.min(width - 60, Math.max(60, layout.extras.fireflyCx));
  const cy = Math.max(110, height * 0.24);
  return (
    <>
      {FACE.map((face, i) => {
        const s = FIREFLY_START[i];
        const o = FIREFLY_SCATTER[i];
        return (
          <At
            key={i}
            left={cx - 9}
            top={cy - 9}
            width={18}
            height={18}
            opacity={fade(p, 0.02, 0.14, 0.8, 0.98)}
            transform={[
              { translateX: track(p, [[0, s[0]], [0.5, face[0]], [0.78, face[0]], [1, o[0]]]) },
              { translateY: track(p, [[0, s[1]], [0.5, face[1]], [0.78, face[1]], [1, o[1]]]) },
              { scale: track(p, [[0, 1], [0.5, 1], [0.6, 1.25], [0.7, 1], [1, 1]]) },
            ]}
          >
            <Prop
              art="prop-firefly"
              width={18}
              height={18}
              fallback={
                <>
                  <View style={abs({ left: 0, top: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: tokens.warm, opacity: 0.3 })} />
                  <View style={abs({ left: 5, top: 5, width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.warm })} />
                </>
              }
            />
          </At>
        );
      })}
    </>
  );
}

// ----- 8. Tea-time visitor: a small cloud floats down beside a lawn gnome, two teacups bob, it leaves -----
function TeaTime({ p, layout, width }: SceneProps) {
  const gnomeLeft = Math.min(width - 54, layout.extras.teaCx);
  const gnomeTop = layout.extras.teaBaseY - 40;
  const cloudTop = gnomeTop - 22;
  const cloudLeft = gnomeLeft - 74;
  const rise = cloudTop + 90;
  const cup = (left: number, top: number, key: string) => (
    <At key={key} left={left} top={top} width={14} height={12} opacity={fade(p, 0.24, 0.3, 0.74, 0.8)} transform={[{ translateY: track(p, pulses(0.3, 0.72, 4, -3)) }]}>
      <View style={abs({ left: 0, top: 2, width: 12, height: 9, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: tokens.white, borderColor: tokens.brown, borderWidth: 1 })} />
      <View style={abs({ left: 10, top: 4, width: 4, height: 4, borderRadius: 2, borderColor: tokens.brown, borderWidth: 1 })} />
    </At>
  );
  return (
    <>
      <At left={gnomeLeft} top={gnomeTop} width={46} height={46} opacity={fade(p, 0.08, 0.2, 0.84, 0.94)}>
        <Prop
          art="prop-gnome"
          width={46}
          height={46}
          fallback={
            <>
              <View style={abs({ left: 9, top: 26, width: 28, height: 20, borderRadius: 8, backgroundColor: tokens.blue })} />
              <View style={abs({ left: 13, top: 14, width: 20, height: 18, borderRadius: 10, backgroundColor: tokens.white })} />
              <View style={abs({ left: 13, top: 0, width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 18, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: tokens.warm })} />
            </>
          }
        />
      </At>
      <At left={cloudLeft} top={cloudTop} width={68} height={46} opacity={fade(p, 0, 0.08, 0.88, 1)} transform={[{ translateY: track(p, [[0, -rise], [0.25, 0], [0.78, 0], [1, -rise]]) }]}>
        <Prop
          art="prop-cloud-tea"
          width={68}
          height={46}
          fallback={
            <>
              <View style={abs({ left: 4, top: 18, width: 60, height: 24, borderRadius: 12, backgroundColor: tokens.white })} />
              <View style={abs({ left: 14, top: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: tokens.white })} />
              <View style={abs({ left: 32, top: 10, width: 22, height: 22, borderRadius: 11, backgroundColor: tokens.white })} />
            </>
          }
        />
      </At>
      {cup(gnomeLeft - 8, gnomeTop + 32, 'a')}
      {cup(cloudLeft + 52, cloudTop + 34, 'b')}
    </>
  );
}

const styles = StyleSheet.create({
  beam: { borderRadius: 16, backgroundColor: tokens.white },
  daisy: { width: 20, height: 20, borderRadius: 10, backgroundColor: tokens.white, borderColor: tokens.meadow, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  daisyCentre: { width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.warm },
});
