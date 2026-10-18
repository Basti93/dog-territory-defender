import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { artOr } from '../../art/artAssets';
import { DenEconomyState } from '../../economy/denEconomy';
import { passiveTreatsPerHour, storageCap } from '../../economy/formulas';
import { formatNumber, t } from '../../i18n';
import { AnimatedNumber, DecorImage, material, textStyle, tokens } from '../../ui';
import {
  BURST_FLIGHT_MS,
  BURST_STAGGER_MS,
  bakeryEmitIntervalMs,
  bowlAtCap,
  bowlFillLevel,
  burstSpriteCount,
  formatRatePerHour,
  projectedTreats,
} from './bakeryRules';

// Presentation-only decor that makes the cookie-clicker loop visible in the world scene: treats flying
// from the bakery chimney into the bowl, the bowl's pile and live number, the upgrade sparkle.
// Nothing here writes to storage; the real accrual still happens at launch (useLaunchEffects).

const FLIGHT_SPRITE = 18;
const FLIGHT_ARC = 46;
const SINGLE_FLIGHT_MS = 1400;
const FIRST_EMIT_MAX_MS = 1500;
/** Never more than this many treat sprites in the air at once. */
const MAX_FLIGHTS = 6;
const TICK_MS = 250; // 4 Hz: the one throttled setState of the whole decor
const ARC_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export interface Point {
  x: number;
  y: number;
}

/**
 * Treats the bowl shows: the stored value plus what the bakery/territories accrue while the scene is
 * visible (the same linear projection applyPassiveAccrual uses, capped like it). Display only; at the next
 * launch the real accrual from the unchanged lastTickAt credits the same amount. setState at 4 Hz at most,
 * and only when the whole number changes.
 */
export function useBowlProjection({ state, extraRate, active }: { state: DenEconomyState | null; extraRate: number; active: boolean }) {
  const gain = useRef(0);
  const lastAt = useRef(Date.now());
  const lastShown = useRef(0);
  const [, bump] = useState(0);
  const treats = state?.treats ?? 0;
  const cap = state ? storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel) : 0;
  const ratePerHour = state ? passiveTreatsPerHour(state.bakeryLevel, state.level) + extraRate : 0;
  const latest = useRef({ treats, cap, ratePerHour });
  latest.current = { treats, cap, ratePerHour };
  const hasState = !!state;

  useEffect(() => {
    if (!active || !hasState) return;
    lastAt.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const hours = (now - lastAt.current) / 3_600_000;
      lastAt.current = now;
      const l = latest.current;
      // Stop banking once full, so spending later does not release hours of "invisible" gain.
      gain.current = Math.min(gain.current + hours * l.ratePerHour, Math.max(0, l.cap - l.treats));
      const shown = Math.floor(projectedTreats(l.treats, gain.current, l.cap));
      if (shown !== lastShown.current) {
        lastShown.current = shown;
        bump((n) => n + 1);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [active, hasState]);

  const projected = projectedTreats(treats, gain.current, cap);
  lastShown.current = Math.floor(projected);
  return { projected, cap, ratePerHour };
}

interface FlightSpec {
  id: number;
  delay: number;
  duration: number;
}

/** One treat sprite rising from `from`, arcing over and dropping to `to`. Native driver only. */
function Flight({ from, to, delay, duration, onDone }: { from: Point; to: Point; delay: number; duration: number; onDone: () => void }) {
  const p = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const anim = Animated.timing(p, { toValue: 1, duration, delay, easing: Easing.linear, useNativeDriver: true });
    anim.start(({ finished }) => {
      if (finished) done.current();
    });
    return () => anim.stop();
  }, [p, duration, delay]);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const source = artOr('icon-treat', null);
  if (!source) return null;
  return (
    <Animated.View
      testID="treat-flight"
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: from.x - FLIGHT_SPRITE / 2,
        top: from.y - FLIGHT_SPRITE / 2,
        width: FLIGHT_SPRITE,
        height: FLIGHT_SPRITE,
        opacity: p.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: p.interpolate({ inputRange: ARC_STEPS, outputRange: ARC_STEPS.map((q) => dy * q - FLIGHT_ARC * 4 * q * (1 - q)) }) },
          { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '30deg'] }) },
          { scale: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1, 0.75] }) },
        ],
      }}
    >
      <DecorImage source={source} resizeMode="contain" style={{ width: FLIGHT_SPRITE, height: FLIGHT_SPRITE }} />
    </Animated.View>
  );
}

export interface TreatFlightsProps {
  /** False during walks, the Homecoming, the gate beat and while scrolled away: nothing flies. */
  active: boolean;
  ratePerHour: number;
  /** The bowl is full: the bakery rests (no alarm, the bone on the grass says it). */
  atCap: boolean;
  from: Point;
  to: Point;
  /** Welcome-back: a new key fires one short burst of `count` sprites. */
  burst: { key: number; count: number } | null;
}

/** Bakery -> bowl flights: a steady trickle derived from the passive rate, plus the welcome-back burst. */
export function TreatFlights({ active, ratePerHour, atCap, from, to, burst }: TreatFlightsProps) {
  const [flights, setFlights] = useState<FlightSpec[]>([]);
  const nextId = useRef(1);
  const spawn = useCallback((count: number, stagger: number, duration: number) => {
    setFlights((prev) => {
      const room = Math.max(0, 8 - prev.length);
      const add: FlightSpec[] = [];
      for (let i = 0; i < Math.min(count, room); i++) add.push({ id: nextId.current++, delay: i * stagger, duration });
      return add.length ? [...prev, ...add] : prev;
    });
  }, []);
  const remove = useCallback((id: number) => setFlights((prev) => prev.filter((f) => f.id !== id)), []);

  const intervalMs = bakeryEmitIntervalMs(ratePerHour);
  useEffect(() => {
    if (!active || atCap) return;
    let timer: ReturnType<typeof setTimeout>;
    const loop = (delay: number) => {
      timer = setTimeout(() => {
        setFlights((prev) => (prev.length >= MAX_FLIGHTS ? prev : [...prev, { id: nextId.current++, delay: 0, duration: SINGLE_FLIGHT_MS }]));
        loop(intervalMs);
      }, delay);
    };
    loop(Math.min(intervalMs, FIRST_EMIT_MAX_MS));
    return () => clearTimeout(timer);
  }, [active, atCap, intervalMs]);

  const burstKey = burst?.key ?? null;
  const burstCount = burst?.count ?? 0;
  useEffect(() => {
    if (burstKey === null || !active) return;
    spawn(burstSpriteCount(burstCount), BURST_STAGGER_MS, BURST_FLIGHT_MS);
    // One burst per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstKey]);

  // Leaving the active state (walk starts) clears anything still in the air.
  useEffect(() => {
    if (!active) setFlights([]);
  }, [active]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flights.map((f) => (
        <Flight key={f.id} from={from} to={to} delay={f.delay} duration={f.duration} onDone={() => remove(f.id)} />
      ))}
    </View>
  );
}

// Overlay treats in the 120x120 bowl box, in stacking order (bottom ones first), 20dp each.
const PILE_SPOTS: { x: number; y: number; r: number }[] = [
  { x: 36, y: 50, r: -25 },
  { x: 62, y: 52, r: 20 },
  { x: 48, y: 40, r: -8 },
  { x: 68, y: 40, r: 32 },
  { x: 40, y: 30, r: 14 },
];
const PILE_SPRITE = 22;

/** The bowl and its pile: bowl-empty when empty, bowl otherwise, plus 2..5 overlay treats as it fills; a bone on the grass at cap. */
export function BowlFill({ treats, cap, boxLeft, boxTop }: { treats: number; cap: number; boxLeft: number; boxTop: number }) {
  const level = bowlFillLevel(treats, cap);
  const bowl = artOr(level === 0 ? 'bowl-empty' : 'bowl', null);
  const treat = artOr('icon-treat', null);
  const pile = level >= 2 && treat ? PILE_SPOTS.slice(0, level) : [];
  return (
    <>
      {bowl ? <DecorImage source={bowl} resizeMode="contain" style={{ position: 'absolute', left: boxLeft, top: boxTop, width: 120, height: 120 }} /> : null}
      {pile.map((spot, i) => (
        <View
          key={i}
          testID={`bowl-pile-${i}`}
          pointerEvents="none"
          style={{ position: 'absolute', left: boxLeft + spot.x, top: boxTop + spot.y, width: PILE_SPRITE, height: PILE_SPRITE, transform: [{ rotate: `${spot.r}deg` }] }}
        >
          <DecorImage source={treat!} resizeMode="contain" style={styles.fill} />
        </View>
      ))}
      {bowlAtCap(treats, cap) && treat ? (
        <View
          testID="bowl-bone"
          pointerEvents="none"
          style={{ position: 'absolute', left: boxLeft + 112, top: boxTop + 66, width: 34, height: 34, transform: [{ rotate: '-35deg' }] }}
        >
          <DecorImage source={treat} resizeMode="contain" style={styles.fill} />
        </View>
      ) : null}
    </>
  );
}

/** The bowl sign's content: live count ("N of CAP treats") and the small hourly rate under it. */
export function BowlSignContent({
  shown,
  cap,
  ratePerHour,
  welcomeFrom,
}: {
  shown: number;
  cap: number;
  ratePerHour: number;
  /** Welcome-back: the number counts up from here once, remounting the ticker. */
  welcomeFrom: number | null;
}) {
  return (
    <View style={styles.signBody}>
      <AnimatedNumber
        key={welcomeFrom === null ? 'live' : 'welcome'}
        from={welcomeFrom ?? undefined}
        value={Math.floor(shown)}
        duration={900}
        format={(n) => t('world.bowlSign', { count: formatNumber(Math.floor(n)), cap: formatNumber(cap) })}
        style={[textStyle('sign'), styles.ink]}
      />
      {ratePerHour > 0 ? <Text style={[textStyle('small'), styles.muted]}>{t('world.ratePerHour', { rate: formatRatePerHour(ratePerHour) })}</Text> : null}
    </View>
  );
}

const SPARKLE_MS = 3600;
const SPARKLE_STARTS = [0.02, 0.35, 0.68];
const SPARKLE_SPOTS = [
  { x: 4, y: 58 },
  { x: 30, y: 38 },
  { x: 16, y: 8 },
];

/** Three slow twinkling dots next to a building's pennant ("this one could grow"). One native loop drives all three. */
export function UpgradeSparkle({ left, bottom }: { left: number; bottom: number }) {
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    phase.setValue(0);
    const loop = Animated.loop(Animated.timing(phase, { toValue: 1, duration: SPARKLE_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [phase]);
  return (
    <View pointerEvents="none" testID="upgrade-sparkle" style={{ position: 'absolute', left, bottom, width: 44, height: 72 }}>
      {SPARKLE_STARTS.map((s, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              left: SPARKLE_SPOTS[i].x,
              top: SPARKLE_SPOTS[i].y,
              opacity: phase.interpolate({ inputRange: [0, s, s + 0.15, s + 0.3, 1], outputRange: [0, 0, 1, 0, 0] }),
              transform: [{ scale: phase.interpolate({ inputRange: [0, s, s + 0.15, s + 0.3, 1], outputRange: [0.4, 0.4, 1.2, 0.4, 0.4] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  signBody: { alignItems: 'center' },
  ink: { color: material.ink, fontSize: 15, lineHeight: 18, textAlign: 'center' },
  muted: { color: material.muted, textAlign: 'center' },
  fill: { width: '100%', height: '100%' },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.white,
    borderWidth: 1.5,
    borderColor: tokens.warm,
  },
});
