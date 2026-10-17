// Animated Buddy rig. This file only POSITIONS and ANIMATES parts; a
// BuddySkin (src/buddy/buddySkin.ts) draws them. All motion is transform or
// opacity on the native driver. Animated nodes (10): root, tail, body, head,
// earLeft, earRight, eyesClosed, mouthHappy, zzz, caption.
//
// Lifecycle rule: every Animated handle and timer started by the mood effect
// is tracked locally and torn down in that effect's cleanup (runs on mood
// change and on unmount). Tap/settle/caption timers are cleared by the
// unmount effect. Nothing sets state after unmount.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { BuddyAppearance } from '../../buddy/buddyAppearance';
import { BuddySkin, vectorSkin } from '../../buddy/buddySkin';
import { BuddyMood, BuddyTrick, nextTrickDelayMs, pickTrick, randomDelayMs, tapCaption } from './buddyMood';

export interface BuddyAvatarProps {
  appearance: BuddyAppearance;
  /** Edge length of the square canvas in px (looks good from 72 to 220). */
  size: number;
  /** Direction Buddy looks. Default 'right'. */
  facing?: 'left' | 'right';
  /** Mood the screen asks for. Tap temporarily overrides with `happy`. Default 'idle'. */
  mood?: BuddyMood;
  /** Called after Buddy's own tap reaction starts. */
  onPress?: () => void;
  /** Dog name, used in tap captions. */
  name?: string | null;
  /** Show a small caption bubble on tap (game-master copy). Default false. */
  showCaption?: boolean;
  /** `excited` settles to idle after this many ms. null = stay excited. Default 3000. */
  excitedSettleMs?: number | null;
  /** Bump to restart the current mood's animation (e.g. a second upgrade while still excited). */
  replayKey?: number;
  /** Injectable random source for blink/flick/trick timing. */
  rng?: () => number;
  /** Art provider. Default: built-in vector skin. */
  skin?: BuddySkin;
}

type Timer = ReturnType<typeof setTimeout>;

const TAP_HAPPY_MS = 1500;
const CAPTION_HOLD_MS = 1400;
const DEG_RANGE = { inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] };

const sine = Easing.inOut(Easing.sin);

function useConst<T>(make: () => T): T {
  const ref = useRef<T | null>(null);
  if (ref.current === null) ref.current = make();
  return ref.current;
}

export function BuddyAvatar({
  appearance,
  size,
  facing = 'right',
  mood = 'idle',
  onPress,
  name,
  showCaption = false,
  excitedSettleMs = 3000,
  replayKey,
  rng: rngProp = Math.random,
  skin = vectorSkin,
}: BuddyAvatarProps) {
  // ----- animated values (one set per Buddy, never recreated) -----
  const v = useConst(() => ({
    breath: new Animated.Value(0), // 0..1
    tail: new Animated.Value(0), // deg
    tilt: new Animated.Value(0), // deg
    headBob: new Animated.Value(0), // px
    earBase: new Animated.Value(0), // deg
    flickL: new Animated.Value(0),
    flickR: new Animated.Value(0),
    earShake: new Animated.Value(0),
    lid: new Animated.Value(0), // eyesClosed opacity
    tongue: new Animated.Value(0),
    settle: new Animated.Value(0), // sleepy curl 0..1
    trickPose: new Animated.Value(0), // -1 bow, +1 sit tall
    hopY: new Animated.Value(0),
    squash: new Animated.Value(1),
    spin: new Animated.Value(0),
    shake: new Animated.Value(0),
    shiftX: new Animated.Value(0),
    z: new Animated.Value(0),
    caption: new Animated.Value(0),
  }));

  // Held in a ref so an inline `rng` prop never restarts the mood effect.
  const rngRef = useRef(rngProp);
  rngRef.current = rngProp;
  const rng = useCallback(() => rngRef.current(), []);

  // ----- state: tap override + excited settle -----
  const [tapping, setTapping] = useState(false);
  const [tapTick, setTapTick] = useState(0);
  const [settled, setSettled] = useState(false);
  const [captionText, setCaptionText] = useState<string | null>(null);
  const tapCount = useRef(0);
  const tapTimer = useRef<Timer | null>(null);
  const settleTimer = useRef<Timer | null>(null);
  const captionTimer = useRef<Timer | null>(null);
  const captionAnim = useRef<Animated.CompositeAnimation | null>(null);

  const effectiveMood: BuddyMood = tapping ? 'happy' : mood === 'excited' && settled ? 'idle' : mood;

  useEffect(() => {
    setSettled(false);
    if (mood === 'excited' && excitedSettleMs != null) {
      settleTimer.current = setTimeout(() => setSettled(true), excitedSettleMs);
    }
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = null;
    };
  }, [mood, excitedSettleMs, replayKey]);

  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      if (captionTimer.current) clearTimeout(captionTimer.current);
      captionAnim.current?.stop();
    },
    []
  );

  // ----- geometry in px relative to the canvas centre (RN's transform origin) -----
  const appearanceKey = JSON.stringify(appearance);
  const geo = useMemo(() => {
    const p = skin.pivots(appearance);
    const rel = (pt: { x: number; y: number }) => ({ x: pt.x * size - size / 2, y: pt.y * size - size / 2 });
    return {
      head: rel(p.head),
      tail: rel(p.tail),
      earLeft: rel(p.earLeft),
      earRight: rel(p.earRight),
      ground: skin.groundY * size - size / 2,
      neckX: p.head.x,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skin, appearanceKey, size]);

  // Static part elements: built once per look/size so tap/mood state changes never re-render SVG.
  const parts = useMemo(() => {
    const args = { appearance, size, partBox: { x: 0, y: 0, width: size, height: size } };
    const P = skin.parts;
    return {
      body: P.body(args),
      frontLegs: P.frontLegs(args),
      tail: P.tail(args),
      head: P.head(args),
      eyesOpen: P.eyesOpen(args),
      eyesClosed: P.eyesClosed(args),
      mouthHappy: P.mouthHappy(args),
      earLeft: P.earLeft(args),
      earRight: P.earRight(args),
      zzz: (P.zzz ?? vectorSkin.parts.zzz)!(args),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skin, appearanceKey, size]);

  // ----- derived animated styles -----
  const deg = (n: Animated.AnimatedNode) => (n as Animated.AnimatedInterpolation<number>).interpolate(DEG_RANGE as never);
  const pivotRotate = (rotation: Animated.AnimatedNode, c: { x: number; y: number }) => [
    { translateX: c.x },
    { translateY: c.y },
    { rotate: deg(rotation) as unknown as string },
    { translateX: -c.x },
    { translateY: -c.y },
  ];

  const styles = useMemo(() => {
    const box = { position: 'absolute' as const, left: 0, top: 0, width: size, height: size };
    const bodyScaleY = Animated.multiply(
      Animated.multiply(
        v.breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }),
        v.settle.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] })
      ),
      v.trickPose.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.95, 1, 1.045] })
    );
    const headY = Animated.add(
      Animated.add(
        v.breath.interpolate({ inputRange: [0, 1], outputRange: [0, -0.012 * size] }),
        v.settle.interpolate({ inputRange: [0, 1], outputRange: [0, 0.04 * size] })
      ),
      Animated.add(v.headBob, v.trickPose.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.03 * size, 0, -0.01 * size] }))
    );
    const headRot = Animated.add(v.tilt, v.trickPose.interpolate({ inputRange: [-1, 0, 1], outputRange: [14, 0, -8] }));
    return {
      box,
      root: [
        { translateX: v.shiftX },
        { translateY: v.hopY },
        { translateY: geo.ground },
        { scaleY: v.squash },
        { translateY: -geo.ground },
        { rotate: deg(Animated.add(v.spin, v.shake)) as unknown as string },
      ],
      body: [
        { translateY: geo.ground },
        { scaleY: bodyScaleY },
        { translateY: -geo.ground },
      ],
      head: [{ translateY: headY }, ...pivotRotate(headRot, geo.head)],
      tail: pivotRotate(v.tail, geo.tail),
      earLeft: pivotRotate(Animated.add(Animated.add(v.earBase, v.flickL), v.earShake), geo.earLeft),
      earRight: pivotRotate(Animated.add(Animated.add(v.earBase, v.flickR), v.earShake), geo.earRight),
      zzz: {
        opacity: v.z.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: v.z.interpolate({ inputRange: [0, 1], outputRange: [0, -0.2 * size] }) },
          { translateX: v.z.interpolate({ inputRange: [0, 1], outputRange: [0, 0.05 * size] }) },
          { scale: v.z.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) },
        ],
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, size]);

  // ----- the mood engine: one effect, one cleanup -----
  useEffect(() => {
    const anims = new Set<Animated.CompositeAnimation>();
    const timers = new Set<Timer>();
    let alive = true;

    const run = (a: Animated.CompositeAnimation) => {
      anims.add(a);
      a.start(() => anims.delete(a));
    };
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (alive) fn();
      }, ms);
      timers.add(t);
    };
    const chain = (fn: () => void, minMs: number, maxMs: number) => {
      const tick = () =>
        later(() => {
          fn();
          tick();
        }, randomDelayMs(rng, minMs, maxMs));
      tick();
    };
    const timing = (value: Animated.Value, toValue: number, duration: number, easing = sine) =>
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
    const to = (value: Animated.Value, toValue: number, duration = 400) => run(timing(value, toValue, duration));

    // transients snap to rest; postures glide to this mood's target
    v.hopY.setValue(0);
    v.squash.setValue(1);
    v.spin.setValue(0);
    v.shake.setValue(0);
    v.earShake.setValue(0);
    v.flickL.setValue(0);
    v.flickR.setValue(0);
    v.tail.setValue(0);

    const m = effectiveMood;
    const sleepy = m === 'sleepy';
    const joyful = m === 'happy' || m === 'excited';
    to(v.settle, sleepy ? 1 : 0, 500);
    to(v.tilt, m === 'curious' ? 12 : sleepy ? 7 : 0, 400);
    to(v.headBob, sleepy ? 0.015 * size : 0, 400);
    to(v.earBase, m === 'curious' || m === 'excited' ? -10 : 0, 300);
    to(v.tongue, joyful ? 1 : 0, 150);
    to(v.lid, sleepy ? 1 : 0, 300);
    to(v.trickPose, 0, 200);
    to(v.shiftX, 0, 300);

    // breathing (slower when sleepy)
    const breathMs = sleepy ? 3200 : 1700;
    run(Animated.loop(Animated.sequence([timing(v.breath, 1, breathMs), timing(v.breath, 0, breathMs)])));

    const hop = (height: number, spinDeg = 0) =>
      Animated.sequence([
        timing(v.squash, 0.88, 70),
        Animated.parallel([
          Animated.timing(v.hopY, { toValue: -height, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          timing(v.squash, 1.06, 180),
          ...(spinDeg ? [Animated.timing(v.spin, { toValue: spinDeg, duration: 340, easing: sine, useNativeDriver: true })] : []),
        ]),
        Animated.parallel([
          Animated.timing(v.hopY, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          timing(v.squash, 1, 170),
        ]),
        ...(spinDeg ? [Animated.timing(v.spin, { toValue: 0, duration: 1, useNativeDriver: true })] : []),
      ]);
    const wag = (amp: number, halfMs: number) =>
      Animated.loop(Animated.sequence([timing(v.tail, amp, halfMs), timing(v.tail, -amp, halfMs)]));
    const blink = () => {
      const once = Animated.sequence([timing(v.lid, 1, 70), Animated.delay(50), timing(v.lid, 0, 90)]);
      run(rng() < 0.2 ? Animated.sequence([once, Animated.delay(120), once]) : once);
    };
    const flick = () => {
      const ear = rng() < 0.5 ? v.flickL : v.flickR;
      run(Animated.sequence([timing(ear, -16, 110), timing(ear, 8, 110), timing(ear, 0, 120)]));
    };

    if (m === 'idle' || m === 'curious') {
      run(wag(m === 'idle' ? 14 : 10, m === 'idle' ? 900 : 1200));
      chain(blink, 3000, 6000);
      chain(flick, 5000, 11000);
      if (m === 'idle') {
        chain(
          () => {
            const dir = rng() < 0.5 ? -1 : 1;
            run(
              Animated.sequence([timing(v.tilt, dir * 12, 350), Animated.delay(1200), timing(v.tilt, 0, 400)])
            );
          },
          7000,
          14000
        );
        chain(
          () => {
            const dx = (rng() < 0.5 ? -1 : 1) * 0.012 * size;
            run(Animated.sequence([timing(v.shiftX, dx, 600), Animated.delay(900), timing(v.shiftX, 0, 600)]));
          },
          8000,
          16000
        );
        // random tricks
        let previous: BuddyTrick | null = null;
        const scheduleTrick = () =>
          later(() => {
            const trick = pickTrick(rng, previous);
            previous = trick;
            if (trick === 'sit') {
              run(Animated.sequence([timing(v.trickPose, 1, 300), Animated.delay(1000), timing(v.trickPose, 0, 350)]));
            } else if (trick === 'stretch') {
              run(Animated.sequence([timing(v.trickPose, -1, 450), Animated.delay(1100), timing(v.trickPose, 0, 450)]));
            } else {
              const step = (to_: number) => timing(v.shake, to_, 70);
              const ear = (to_: number) => timing(v.earShake, to_, 70);
              run(
                Animated.sequence([
                  ...[5, -5, 5, -5, 4, -4, 0].map((d) => Animated.parallel([step(d), ear(d * 4)])),
                  timing(v.earShake, 0, 60),
                ])
              );
            }
            scheduleTrick();
          }, nextTrickDelayMs(rng));
        scheduleTrick();
      } else {
        // curious: slow nod, like sniffing toward something
        run(
          Animated.loop(
            Animated.sequence([timing(v.headBob, 0.02 * size, 900), timing(v.headBob, 0, 900), Animated.delay(800)])
          )
        );
      }
    } else if (m === 'happy') {
      const variant = tapCount.current % 3;
      const h = size * 0.13;
      run(wag(30, 80));
      run(
        Animated.sequence([
          hop(h),
          hop(h * 1.15, variant === 1 ? 360 : 0),
          hop(h),
        ])
      );
      if (variant === 2) {
        run(
          Animated.sequence(
            [4, -4, 4, -4, 0].map((d) => timing(v.shake, d, 70))
          )
        );
      }
      chain(blink, 700, 1200);
    } else if (m === 'excited') {
      const h = size * 0.17;
      run(Animated.loop(Animated.timing(v.tail, { toValue: 360, duration: 450, easing: Easing.linear, useNativeDriver: true })));
      const jumps = Animated.sequence([hop(h), Animated.delay(60), hop(h), Animated.delay(60), hop(h * 1.2, 360)]);
      run(excitedSettleMs == null ? Animated.loop(Animated.sequence([jumps, Animated.delay(500)])) : jumps);
      chain(blink, 1500, 3000);
    } else if (sleepy) {
      run(
        Animated.loop(
          Animated.sequence([timing(v.z, 1, 2600, Easing.linear), timing(v.z, 0, 1, Easing.linear)])
        )
      );
      // slow blink: eyes open for a moment, then drift shut
      chain(
        () => run(Animated.sequence([timing(v.lid, 0, 700), Animated.delay(900), timing(v.lid, 1, 800)])),
        4000,
        8000
      );
    }

    return () => {
      alive = false;
      anims.forEach((a) => a.stop());
      anims.clear();
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMood, tapTick, size, excitedSettleMs, skin, replayKey]);

  // ----- tap -----
  const handlePress = () => {
    tapCount.current += 1;
    setTapTick((t) => t + 1);
    setTapping(true);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setTapping(false);
    }, TAP_HAPPY_MS);

    if (showCaption) {
      setCaptionText(tapCaption(tapCount.current - 1, name));
      captionAnim.current?.stop();
      if (captionTimer.current) clearTimeout(captionTimer.current);
      v.caption.setValue(0);
      const a = Animated.timing(v.caption, { toValue: 1, duration: 160, useNativeDriver: true });
      captionAnim.current = a;
      a.start();
      captionTimer.current = setTimeout(() => {
        captionTimer.current = null;
        const out = Animated.timing(v.caption, { toValue: 0, duration: 300, useNativeDriver: true });
        captionAnim.current = out;
        out.start();
      }, CAPTION_HOLD_MS);
    }
    onPress?.();
  };

  const flipped = facing !== skin.nativeFacing;
  const headX = flipped ? 1 - geo.neckX : geo.neckX;
  const zzzLeft = (headX + (facing === 'right' ? 0.04 : -0.12)) * size;
  const captionWidth = Math.round(size * 1.4);
  const shadowW = size * 0.56;
  const shadowH = Math.max(4, size * 0.05);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={name ? `${name}` : 'Your dog'}
      style={{ width: size, height: size }}
    >
      <View style={[styles.box, flipped && { transform: [{ scaleX: -1 }] }]} pointerEvents="none">
        <View
          style={{
            position: 'absolute',
            left: (size - shadowW) / 2,
            top: (skin.groundY * size) - shadowH / 2 + 1,
            width: shadowW,
            height: shadowH,
            borderRadius: shadowH,
            backgroundColor: '#8B6F47',
            opacity: 0.15,
          }}
        />
        <Animated.View style={[styles.box, { transform: styles.root as never }]}>
          <Animated.View style={[styles.box, { transform: styles.tail as never }]}>{parts.tail}</Animated.View>
          <Animated.View style={[styles.box, { transform: styles.body as never }]}>
            {parts.body}
            {parts.frontLegs}
          </Animated.View>
          <Animated.View style={[styles.box, { transform: styles.head as never }]}>
            <Animated.View style={[styles.box, { transform: styles.earRight as never }]}>{parts.earRight}</Animated.View>
            {parts.head}
            {parts.eyesOpen}
            <Animated.View style={[styles.box, { opacity: v.lid }]}>{parts.eyesClosed}</Animated.View>
            <Animated.View style={[styles.box, { opacity: v.tongue }]}>{parts.mouthHappy}</Animated.View>
            <Animated.View style={[styles.box, { transform: styles.earLeft as never }]}>{parts.earLeft}</Animated.View>
          </Animated.View>
        </Animated.View>
      </View>
      {effectiveMood === 'sleepy' && (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: zzzLeft, top: size * 0.12 }, styles.zzz as never]}
        >
          {parts.zzz}
        </Animated.View>
      )}
      {showCaption && captionText !== null && (
        <Animated.View pointerEvents="none" style={[captionStyles.wrap, { width: captionWidth, left: (size - captionWidth) / 2, opacity: v.caption }]}>
          <View style={[captionStyles.bubble, { maxWidth: captionWidth }]}>
            <Text style={captionStyles.text} numberOfLines={2}>
              {captionText}
            </Text>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

const captionStyles = StyleSheet.create({
  wrap: { position: 'absolute', bottom: '100%', alignItems: 'center', paddingBottom: 4 },
  bubble: {
    backgroundColor: '#FAFAF8',
    borderColor: '#DCE8BE',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: { color: '#8B6F47', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
