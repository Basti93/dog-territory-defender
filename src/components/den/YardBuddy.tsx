import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { BuddyAppearance } from '../../buddy/buddyAppearance';
import { BuddyAvatar } from '../buddy';
import { BuddyMood } from '../buddy/buddyMood';
import {
  ACTIVITY_MS,
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

// Buddy living in the yard: wanders between the bench, the bowl and the mailbox. Presentation only. Motion rules: his position is an Animated value on
// the native driver; React state changes only when a behaviour starts or ends (never per frame).
// One extra animated node beyond BuddyAvatar's own: the wrapper (x).
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
  range: WalkRange;
}

interface YardBuddyProps {
  appearance: BuddyAppearance;
  name: string;
  /** Mood the Den asks for while Buddy stands still. `excited` pauses all wandering. */
  mood: BuddyMood;
  replayKey?: number;
  geometry: YardBuddyGeometry;
  rng?: () => number;
  /** Called after Buddy's own tap reaction. The world scene passes nothing: tapping Buddy never starts a walk. */
  onPress?: () => void;
  /**
   * A fetch errand (the stick in the Hof): Buddy trots to `x` (centre, yard px), calls `onArrived` there, plays a short happy beat,
   * then wanders again. A new `key` starts a new errand; the same key never replays.
   */
  errand?: { key: number; x: number; onArrived: () => void } | null;
}

interface BehaviourView {
  mood: BuddyMood | null;
  walk: WalkPlan | null;
}
const REST_VIEW: BehaviourView = { mood: null, walk: null };

interface Engine {
  pause(): void;
  resume(): void;
  fetch(x: number, onArrived: () => void): void;
}

type Timer = ReturnType<typeof setTimeout>;
const sine = Easing.inOut(Easing.sin);
/** How long Buddy is happy (tail wag / shake) after picking something up. */
const ERRAND_HAPPY_MS = 1800;

export function YardBuddy({ appearance, name, mood, replayKey, geometry, rng = Math.random, onPress, errand }: YardBuddyProps) {
  const v = useRef({ x: new Animated.Value(0) }).current;
  const [view, setView] = useState<BehaviourView>(REST_VIEW);
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const xRef = useRef<number | null>(null); // centre x; kept across re-layouts
  const atRef = useRef<SpotId | null>('front');
  const engineRef = useRef<Engine | null>(null);

  // Latest props for the engine's timers (they must not capture stale geometry/rng).
  const geoRef = useRef(geometry);
  geoRef.current = geometry;
  const rngRef = useRef(rng);
  rngRef.current = rng;
  const moodRef = useRef(mood);
  moodRef.current = mood;

  const layoutKey = JSON.stringify([geometry.baseCx, geometry.bottom, geometry.size, geometry.range, geometry.spots]);

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
      setView(REST_VIEW);
    };
    const finish = () => {
      setView(REST_VIEW);
      loop.arm();
    };
    /** At the bench or the mailbox he faces the prop (it is at the screen edge); at the front he keeps his facing. */
    const facePropAt = (spot: SpotId) => {
      if (spot === 'bench') setFacing('left');
      else if (spot === 'mailbox') setFacing('right');
    };

    /** Walk to `x`; `spot` is where he counts as being afterwards (null = none of the three). */
    const goToX = (x: number, spot: SpotId | null, then: () => void) => {
      const target = clampX(x, geo.range);
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
    const goTo = (spot: SpotId, then: () => void) => goToX(geo.spots[spot], spot, then);

    const doActivity = (spot: SpotId) => {
      const act = pickActivity(r, spot);
      facePropAt(spot);
      const actMood: BuddyMood = act === 'sniff' ? 'curious' : act === 'sleep' ? 'sleepy' : act === 'trick' ? 'happy' : 'idle';
      setView({ ...REST_VIEW, mood: actMood });
      later(finish, ACTIVITY_MS[act]);
    };

    function beginWander() {
      const dest = pickDestination(r, atRef.current);
      goTo(dest, () => doActivity(dest));
    }

    engineRef.current = {
      pause: () => {
        abort();
        loop.pause();
      },
      resume: () => loop.resume(),
      fetch: (x, onArrived) => {
        abort();
        loop.hold();
        goToX(x, null, () => {
          onArrived();
          setView({ ...REST_VIEW, mood: 'happy' });
          later(finish, ERRAND_HAPPY_MS);
        });
      },
    };
    if (moodRef.current === 'excited') loop.pause();
    loop.arm();

    return () => {
      engineRef.current = null;
      loop.stop();
      clearAll();
    };
    // Rebuilt only when the layout changes; everything else is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Upgrade beat (excited) pauses wandering; it resumes with a fresh 15-30 s wait afterwards.
  useEffect(() => {
    if (mood === 'excited') engineRef.current?.pause();
    else engineRef.current?.resume();
  }, [mood, replayKey]);

  // One errand per key; the callback is read through a ref so a re-render never restarts it.
  const errandRef = useRef(errand);
  errandRef.current = errand;
  useEffect(() => {
    const e = errandRef.current;
    if (e) engineRef.current?.fetch(e.x, () => (errandRef.current ?? e).onArrived());
  }, [errand?.key]);

  const avatarMood: BuddyMood = mood === 'excited' ? 'excited' : view.mood ?? mood;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { left: geometry.baseCx - geometry.size / 2, bottom: geometry.bottom, width: geometry.size, height: geometry.size },
        { transform: [{ translateX: v.x }] },
      ]}
    >
      <BuddyAvatar
        appearance={appearance}
        size={geometry.size}
        replayKey={replayKey}
        facing={facing}
        mood={avatarMood}
        name={name}
        excitedSettleMs={null}
        phaseShiftPx={geometry.baseCx - (xRef.current ?? geometry.baseCx)}
        walkHops={view.walk?.hops}
        walkHopMs={view.walk?.hopMs}
        rng={rng}
        onPress={onPress}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
    wrap: { position: 'absolute', zIndex: 5 },
});
