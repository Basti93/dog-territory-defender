import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { BuddyAppearance } from '../../buddy/buddyAppearance';
import { buddyFeetInset } from '../../buddy/imageSkin';
import { tokens } from '../../ui/tokens';
import { BuddyAvatar } from '../buddy';
import { BuddyMood } from '../buddy/buddyMood';
import {
  ACTIVITY_MS,
  BuildingSpot,
  SpotId,
  WalkPlan,
  WalkRange,
  WanderLoop,
  clampX,
  createWanderLoop,
  facingFor,
  pickActivity,
  pickDestination,
  planWalk,
  positionAt,
} from './yardLife';

// Buddy living in the yard: wanders between the building spots, reacts to building taps, snaps at
// butterflies. Presentation only. Motion rules: every position/opacity/rotation is an Animated value on
// the native driver; React state changes only when a behaviour starts or ends (never per frame).
// Extra animated nodes beyond BuddyAvatar's own: wrapper (x + fade), jitter (hop/dig/snap), dirt puff,
// hearts = 4 (butterflies add 2 in YardButterflies.tsx, total 6).
// Lifecycle: the engine effect owns one wander clock, and every animation and timer it starts is tracked
// and torn down in that effect's cleanup (runs on scene re-layout and on unmount).

export interface YardBuddyGeometry {
  /** Centre x of Buddy's resting box (the "front middle" spot). */
  baseCx: number;
  /** Box bottom (px up from the yard floor), already includes the feet inset. */
  bottom: number;
  size: number;
  /** Centre x Buddy stands at for each spot, already clamped to `range`. */
  spots: Record<SpotId, number>;
  /** Centre x of each building tile (what he faces / sniffs toward). */
  centers: Record<BuildingSpot, number>;
  range: WalkRange;
}

interface YardBuddyProps {
  appearance: BuddyAppearance;
  name: string;
  /** Mood the Den asks for while Buddy stands still. `excited` pauses all wandering. */
  mood: BuddyMood;
  /** Default facing when nothing else decides (the building he is curious about). */
  curiousFacing: 'left' | 'right';
  replayKey?: number;
  geometry: YardBuddyGeometry;
  /** Garden is stage 3: butterflies are out and he may snap at one. */
  butterflies: boolean;
  /** Bumps on every building tap. */
  tap: { building: BuildingSpot; n: number } | null;
  rng?: () => number;
  /** Called after Buddy's own tap reaction. The world scene passes nothing: tapping Buddy never starts a walk. */
  onPress?: () => void;
}

interface BehaviourView {
  mood: BuddyMood | null;
  walk: WalkPlan | null;
  hidden: boolean;
  fx: 'dig' | 'hearts' | null;
}
const REST_VIEW: BehaviourView = { mood: null, walk: null, hidden: false, fx: null };

interface Engine {
  pause(): void;
  resume(): void;
  react(building: BuildingSpot): void;
}

type Timer = ReturnType<typeof setTimeout>;
const sine = Easing.inOut(Easing.sin);
const DIG_MS = 1200;
const HEARTS_MS = 1800;
const DOGHOUSE_HIDDEN_MS = 1500;
const DOGHOUSE_FADE_MS = 500;
const POP_HAPPY_MS = 2400;

export function YardBuddy({ appearance, name, mood, curiousFacing, replayKey, geometry, butterflies, tap, rng = Math.random, onPress }: YardBuddyProps) {
  const v = useRef({
    x: new Animated.Value(0),
    opacity: new Animated.Value(1),
    jitterY: new Animated.Value(0),
    rot: new Animated.Value(0), // deg
    scale: new Animated.Value(1),
    dirt: new Animated.Value(0),
    hearts: new Animated.Value(0),
  }).current;
  const [view, setView] = useState<BehaviourView>(REST_VIEW);
  const [facing, setFacing] = useState<'left' | 'right'>(curiousFacing);
  const xRef = useRef<number | null>(null); // centre x; kept across re-layouts
  const atRef = useRef<SpotId | null>('front');
  const engineRef = useRef<Engine | null>(null);

  // Latest props for the engine's timers (they must not capture stale geometry/rng/butterflies).
  const geoRef = useRef(geometry);
  geoRef.current = geometry;
  const rngRef = useRef(rng);
  rngRef.current = rng;
  const butterfliesRef = useRef(butterflies);
  butterfliesRef.current = butterflies;
  const moodRef = useRef(mood);
  moodRef.current = mood;

  const layoutKey = JSON.stringify([geometry.baseCx, geometry.bottom, geometry.size, geometry.range, geometry.spots, geometry.centers]);

  useEffect(() => {
    setFacing(curiousFacing);
  }, [curiousFacing]);

  // ----- the engine: one wander clock + tracked animations/timers, rebuilt on every re-layout -----
  useEffect(() => {
    const geo = geoRef.current;
    const r = () => rngRef.current();
    const anims = new Set<Animated.CompositeAnimation>();
    const timers = new Set<Timer>();
    let walk: { from: number; to: number; startedAt: number; durationMs: number } | null = null;

    xRef.current = xRef.current === null ? geo.baseCx : clampX(xRef.current, geo.range);
    v.x.setValue(xRef.current - geo.baseCx);
    setView(REST_VIEW);

    const clearAll = () => {
      anims.forEach((a) => a.stop());
      anims.clear();
      timers.forEach((h) => clearTimeout(h));
      timers.clear();
    };
    const restValues = () => {
      v.jitterY.setValue(0);
      v.rot.setValue(0);
      v.scale.setValue(1);
      v.opacity.setValue(1);
      v.dirt.setValue(0);
      v.hearts.setValue(0);
    };
    const run = (a: Animated.CompositeAnimation, onDone?: () => void) => {
      anims.add(a);
      a.start(({ finished }) => {
        anims.delete(a);
        if (finished) onDone?.();
      });
    };
    const later = (fn: () => void, ms: number) => {
      const h = setTimeout(() => {
        timers.delete(h);
        fn();
      }, ms);
      timers.add(h);
    };
    const timing = (value: Animated.Value, toValue: number, duration: number, easing = sine) =>
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });

    const loop: WanderLoop = createWanderLoop({ rng: r, onFire: () => beginWander() });

    /** Stop whatever he is doing; if mid-walk, he stays where the walk had got to. */
    const abort = () => {
      const w = walk;
      walk = null;
      clearAll();
      if (w) {
        xRef.current = positionAt(w.from, w.to, w.durationMs, Date.now() - w.startedAt);
        atRef.current = null;
        v.x.setValue(xRef.current - geo.baseCx);
      }
      restValues();
      setView(REST_VIEW);
    };
    const finish = () => {
      setView(REST_VIEW);
      loop.arm();
    };
    const faceBuilding = (spot: SpotId) => {
      if (spot !== 'front') setFacing(facingFor(xRef.current ?? geo.baseCx, geo.centers[spot], 'right'));
    };

    const goTo = (spot: SpotId, then: () => void) => {
      const target = clampX(geo.spots[spot], geo.range);
      const from = xRef.current ?? geo.baseCx;
      if (Math.abs(target - from) < 2) {
        atRef.current = spot;
        then();
        return;
      }
      const plan = planWalk(target - from);
      setFacing(facingFor(from, target));
      setView({ ...REST_VIEW, walk: plan });
      walk = { from, to: target, startedAt: Date.now(), durationMs: plan.durationMs };
      run(timing(v.x, target - geo.baseCx, plan.durationMs, Easing.linear), () => {
        walk = null;
        xRef.current = target;
        atRef.current = spot;
        setView(REST_VIEW);
        then();
      });
    };

    const snap = () =>
      run(
        Animated.sequence([
          Animated.parallel([timing(v.jitterY, -14, 140), timing(v.rot, 8, 140)]),
          Animated.parallel([timing(v.jitterY, 0, 180), timing(v.rot, 0, 180)]),
        ])
      );

    const doActivity = (spot: SpotId) => {
      const act = pickActivity(r, spot);
      faceBuilding(spot);
      const actMood: BuddyMood = act === 'sniff' ? 'curious' : act === 'sleep' ? 'sleepy' : act === 'trick' ? 'happy' : 'idle';
      setView({ ...REST_VIEW, mood: actMood });
      if (spot === 'sniffGarden' && butterfliesRef.current && act !== 'trick' && r() < 0.5) later(snap, 700);
      later(finish, ACTIVITY_MS[act]);
    };

    function beginWander() {
      const dest = pickDestination(r, atRef.current);
      goTo(dest, () => doActivity(dest));
    }

    const react = (building: BuildingSpot) => {
      if (loop.isPaused()) return; // an upgrade beat is playing; the tap still scrolls to the card
      abort();
      loop.hold();
      goTo(building, () => {
        faceBuilding(building);
        if (building === 'sniffGarden') {
          setView({ ...REST_VIEW, mood: 'curious', fx: 'dig' });
          const jitter = Array.from({ length: 17 }, (_, i) =>
            Animated.parallel([timing(v.jitterY, i % 2 ? 0 : -3, 70, Easing.linear), timing(v.rot, i % 2 ? -4 : 4, 70, Easing.linear)])
          );
          run(Animated.sequence([...jitter, Animated.parallel([timing(v.jitterY, 0, 40), timing(v.rot, 0, 40)])]));
          v.dirt.setValue(0);
          run(timing(v.dirt, 1, DIG_MS, Easing.linear));
          later(finish, DIG_MS + 60);
        } else if (building === 'bakery') {
          setView({ ...REST_VIEW, mood: 'curious', fx: 'hearts' });
          v.hearts.setValue(0);
          run(timing(v.hearts, 1, HEARTS_MS, Easing.linear));
          later(finish, HEARTS_MS + 100);
        } else {
          // Doghouse: he walks in (fades out in front of the door), then pops back out with a happy hop.
          setView({ ...REST_VIEW, mood: 'idle', hidden: true });
          run(
            Animated.parallel([
              timing(v.opacity, 0, DOGHOUSE_FADE_MS),
              timing(v.jitterY, -22, DOGHOUSE_FADE_MS),
              timing(v.scale, 0.8, DOGHOUSE_FADE_MS),
            ])
          );
          later(() => {
            setView({ ...REST_VIEW, mood: 'happy' });
            run(Animated.parallel([timing(v.opacity, 1, 150), timing(v.jitterY, 0, 150), timing(v.scale, 1, 150)]));
            later(finish, POP_HAPPY_MS);
          }, DOGHOUSE_FADE_MS + DOGHOUSE_HIDDEN_MS);
        }
      });
    };

    engineRef.current = {
      pause: () => {
        abort();
        loop.pause();
      },
      resume: () => loop.resume(),
      react,
    };
    if (moodRef.current === 'excited') loop.pause();
    loop.arm();

    return () => {
      engineRef.current = null;
      loop.stop();
      clearAll();
      restValues();
    };
    // Rebuilt only when the layout changes; everything else is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Upgrade beat (excited) pauses wandering; it resumes with a fresh 15-30 s wait afterwards.
  useEffect(() => {
    if (mood === 'excited') engineRef.current?.pause();
    else engineRef.current?.resume();
  }, [mood, replayKey]);

  useEffect(() => {
    if (tap) engineRef.current?.react(tap.building);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tap?.n]);

  const avatarMood: BuddyMood = mood === 'excited' ? 'excited' : view.mood ?? mood;
  const feet = buddyFeetInset(geometry.size);
  const dirtLeft = facing === 'right' ? geometry.size * 0.68 : geometry.size * 0.14;

  return (
    <Animated.View
      pointerEvents={view.hidden ? 'none' : 'box-none'}
      style={[
        styles.wrap,
        { left: geometry.baseCx - geometry.size / 2, bottom: geometry.bottom, width: geometry.size, height: geometry.size },
        { opacity: v.opacity, transform: [{ translateX: v.x }] },
      ]}
    >
      <Animated.View
        pointerEvents="box-none"
        style={{
          transform: [
            { translateY: v.jitterY },
            { rotate: v.rot.interpolate({ inputRange: [-30, 30], outputRange: ['-30deg', '30deg'] }) },
            { scale: v.scale },
          ],
        }}
      >
        <BuddyAvatar
          appearance={appearance}
          size={geometry.size}
          replayKey={replayKey}
          facing={facing}
          mood={avatarMood}
          name={name}
          excitedSettleMs={null}
          phaseShiftPx={geometry.centers.doghouse - (xRef.current ?? geometry.baseCx)}
          walkHops={view.walk?.hops}
          walkHopMs={view.walk?.hopMs}
          rng={rng}
          onPress={onPress}
        />
      </Animated.View>
      {view.fx === 'dig' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fx,
            {
              left: dirtLeft,
              bottom: feet + 2,
              opacity: v.dirt.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.8, 0] }),
              transform: [{ translateY: v.dirt.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) }],
            },
          ]}
        >
          <View style={[styles.dirtDot, { left: 0, top: 6 }]} />
          <View style={[styles.dirtDot, { left: 11, top: 0 }]} />
          <View style={[styles.dirtDot, { left: 21, top: 7 }]} />
        </Animated.View>
      )}
      {view.fx === 'hearts' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fx,
            {
              left: geometry.size * 0.3,
              bottom: geometry.size * 0.62,
              opacity: v.hearts.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ translateY: v.hearts.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) }],
            },
          ]}
        >
          <Text style={[styles.heart, { left: 0, top: 8 }]}>♥</Text>
          <Text style={[styles.heart, { left: 26, top: 0 }]}>♥</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Above the building hit boxes (zIndex 1) so Buddy is always the top-most touch target in the yard.
  wrap: { position: 'absolute', zIndex: 5 },
  fx: { position: 'absolute', width: 40, height: 30 },
  dirtDot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.brown },
  heart: { position: 'absolute', fontSize: 16, color: tokens.warm },
});
