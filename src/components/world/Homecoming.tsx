import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, ImageSourcePropType, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { artOr } from '../../art/artAssets';
import { BuddyAppearance } from '../../buddy/buddyAppearance';
import { buddyImageSources } from '../../buddy/imageSkinSources';
import { ACHIEVEMENTS } from '../../economy/personalStats';
import * as haptics from '../../feedback/haptics';
import { play } from '../../feedback/sounds';
import { formatNumber, t } from '../../i18n';
import { AnimatedNumber, ArtImage, Confetti, DecorImage, PaperNote, WoodSign, material, spacing, stitch, textStyle } from '../../ui';
import { MAX_COUNT_UP_MS } from '../../ui/AnimatedNumber';
import { BuddyAvatar } from '../buddy';
import { BUDDY_SIZE, SceneLayout, WorldYardLayout } from './sceneLayout';
import { BeatId, HomecomingVariant, HomecomingWalk, OneNumber, homecomingVariant, pickClosingLine, pickOneNumber, planBeats, planExtras } from './homecomingPlan';

// The Heimkehr (konzept section 6): a guided sequence drawn over WorldScene. The scene's camera (its ScrollView)
// is moved through `onCamera`; everything here is positioned in viewport coordinates at the yard camera
// (the scene opens at the yard, where the tail's top is the viewport top) or, for beat 1, over the Viertel.

export const CAMERA_DELAY_MS = 120;
/** Taps inside this window after a beat change are ignored, so a double tap cannot skip a beat. */
export const TAP_LOCK_MS = 450;
export const STITCH_MS = 1200;
const COUNT_START_DELAY_MS = 500;
const MAX_DOTS = 8;
const DOT_MS = 700;

export interface HomecomingProps {
  walk: HomecomingWalk;
  /** Walks closed so far including this one; from 10 on the choreography varies. */
  walkCount: number;
  dog: string;
  appearance: BuddyAppearance;
  layout: SceneLayout;
  yard: WorldYardLayout;
  /** Treats in the bowl after this walk, and the bowl's cap (for the "N of CAP treats" sign). */
  bowl: { total: number; cap: number };
  /** Dog's current level and milestone title, for the gate sign flip. */
  level: number;
  levelTitle: string | null;
  onCamera: (target: 'viertel' | 'yard') => void;
  onDone: () => void;
}

export function Homecoming({ walk, walkCount, dog, appearance, layout, yard, bowl, level, levelTitle, onCamera, onDone }: HomecomingProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const extras = useMemo(() => (walk.manual ? [] : planExtras(walk.rewards)), [walk]);
  const partner = !!walk.partnerName;
  const beats = useMemo(() => planBeats(walk.manual, extras, partner), [walk.manual, extras, partner]);
  const variant = useMemo(() => homecomingVariant(walkCount), [walkCount]);
  const oneNumber = useMemo(() => pickOneNumber(walk), [walk]);
  // Picking remembers the line in memory (no-repeat), so it must happen once per homecoming.
  const closingLine = useMemo(() => pickClosingLine(walk, dog), [walk, dog]);

  const [beatIndex, setBeatIndex] = useState(0);
  const beat = beats[beatIndex];
  const lockedUntil = useRef(0);

  // Sound: the first moment is the loudest one.
  useEffect(() => {
    if (partner) return; // her return is a quiet moment: only the treats make a sound
    play('celebrate');
    haptics.success();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera follows the beat.
  useEffect(() => {
    lockedUntil.current = Date.now() + TAP_LOCK_MS;
    const id = setTimeout(() => onCamera(beat === 'patch' ? 'viertel' : 'yard'), CAMERA_DELAY_MS);
    return () => clearTimeout(id);
    // onCamera is a fresh closure each scene render; only the beat should retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat]);

  const advance = () => {
    if (Date.now() < lockedUntil.current) return;
    if (beatIndex >= beats.length - 1) onDone();
    else setBeatIndex(beatIndex + 1);
  };

  const spot = buddySpot(variant, layout, yard);
  const showYardPieces = beat !== 'patch';
  const spokenText = beat === 'patch' ? oneNumber.big : beat === 'rest' ? closingLine : t('homecoming.tapLabel');

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {beat === 'patch' && <PatchBeat oneNumber={oneNumber} variant={variant} top={insets.top} bottom={insets.bottom} quiet={partner} />}
        {showYardPieces && (
          <>
            <BowlSign layout={layout} width={width} bowl={bowl} earned={walk.rewards.treatsEarned} active={beat === 'bowl'} />
            <HomecomingBuddy
              appearance={appearance}
              dog={dog}
              spot={spot}
              entryFromLeft={beat === 'bowl' && variant.buddyEntry === 'left'}
              lying={beat === 'rest'}
            />
            {beat === 'bowl' && <TreatDots count={walk.rewards.treatsEarned} spot={spot} layout={layout} width={width} />}
          </>
        )}
        {beat === 'extras' && (
          <ExtraPieces
            extras={extras}
            walk={walk}
            layout={layout}
            yard={yard}
            width={width}
            level={level}
            levelTitle={levelTitle}
            dog={dog}
          />
        )}
        {beat === 'rest' && (
          <View style={[styles.closing, { bottom: insets.bottom + spacing.lg }]}>
            <PaperNote style={styles.closingNote} testID="homecoming-closing">
              <Text style={[textStyle('sign'), styles.ink]}>{closingLine}</Text>
            </PaperNote>
          </View>
        )}
      </View>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={advance}
        accessibilityRole="button"
        accessibilityLabel={spokenText}
        accessibilityHint={t('homecoming.tapLabel')}
        testID="homecoming-tap"
      />
    </View>
  );
}

/** Buddy's position in viewport coordinates and the bowl spot the treats roll into. */
export function buddySpot(variant: HomecomingVariant, layout: SceneLayout, yard: WorldYardLayout) {
  const restTop = layout.hofTop + (layout.yardH - yard.buddy.bottom - BUDDY_SIZE);
  const bowlTop = layout.hofTop + layout.yardH - BUDDY_SIZE * 0.55;
  const top = variant.buddyEntry === 'bowl' ? bowlTop : restTop;
  return { left: yard.buddy.left, top, size: BUDDY_SIZE };
}

function PatchBeat({ oneNumber, variant, top, bottom, quiet }: { oneNumber: OneNumber; variant: HomecomingVariant; top: number; bottom: number; quiet: boolean }) {
  const seam = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(seam, { toValue: 1, duration: STITCH_MS, delay: 300, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, delay: 500, useNativeDriver: true, speed: 12, bounciness: 10 }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [seam, pop]);
  return (
    <>
      {/* The seam that "runs": a stitched outline drawn in over the cloth. The portrait is a flat image, so this is native, not a WebView effect. */}
      <Animated.View
        style={[
          styles.seam,
          stitch(4, material.yarn),
          {
            top: top + 120,
            opacity: seam,
            transform: [{ scale: seam.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
          },
        ]}
      />
      <Animated.Text style={[textStyle('hand'), styles.stitching, { top: top + 120 + 190, opacity: seam }]}>{t('homecoming.stitching')}</Animated.Text>
      <Animated.View
        style={[
          styles.bigSign,
          { top: top + 70, opacity: pop, transform: [{ rotate: `${variant.signRotation}deg` }, { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
        ]}
      >
        <WoodSign size="wide" testID="homecoming-number">
          <Text style={[textStyle('signBig'), styles.bigNumber]}>{oneNumber.big}</Text>
          {oneNumber.caption ? <Text style={[textStyle('body'), styles.ink]}>{oneNumber.caption}</Text> : null}
        </WoodSign>
      </Animated.View>
      <Text style={[textStyle('hand'), styles.hint, { bottom: bottom + 110 }]}>{t('homecoming.hint')}</Text>
      {!quiet && <Confetti />}
    </>
  );
}

function BowlSign({ layout, width, bowl, earned, active }: { layout: SceneLayout; width: number; bowl: { total: number; cap: number }; earned: number; active: boolean }) {
  const from = Math.max(0, bowl.total - earned);
  const [value, setValue] = useState(from);
  const played = useRef(false);
  const playOnce = () => {
    if (played.current || earned <= 0) return;
    played.current = true;
    play('treat');
  };
  useEffect(() => {
    if (!active) return;
    const start = setTimeout(() => setValue(bowl.total), COUNT_START_DELAY_MS);
    // If the count-up never reports done, the sound still plays once.
    const fallback = setTimeout(playOnce, COUNT_START_DELAY_MS + MAX_COUNT_UP_MS + 300);
    return () => {
      clearTimeout(start);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, bowl.total]);
  // Covers the scene's own bowl sign at the same spot while the number climbs.
  return (
    <View style={[styles.bowlSign, { left: width / 2 - 115, top: layout.hofTop + layout.yardH + 96 }]}>
      <WoodSign size="medium" textStyleOverride={styles.smallSign}>
        <AnimatedNumber
          from={from}
          value={active ? value : bowl.total}
          onDone={playOnce}
          format={(n) => t('world.bowlSign', { count: formatNumber(Math.floor(n)), cap: formatNumber(bowl.cap) })}
          style={[textStyle('sign'), styles.ink, styles.smallSign]}
        />
      </WoodSign>
    </View>
  );
}

function HomecomingBuddy({
  appearance,
  dog,
  spot,
  entryFromLeft,
  lying,
}: {
  appearance: BuddyAppearance;
  dog: string;
  spot: { left: number; top: number; size: number };
  entryFromLeft: boolean;
  lying: boolean;
}) {
  const slide = useRef(new Animated.Value(entryFromLeft ? 0 : 1)).current;
  useEffect(() => {
    if (!entryFromLeft) return;
    slide.setValue(0);
    const anim = Animated.timing(slide, { toValue: 1, duration: 600, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [entryFromLeft, slide]);
  const lyingSource = buddyImageSources(appearance).poseLying as ImageSourcePropType | undefined;
  return (
    <Animated.View
      style={[
        styles.abs,
        { left: spot.left, top: spot.top, width: spot.size, height: spot.size },
        { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-(spot.left + spot.size), 0] }) }] },
      ]}
    >
      {lying && lyingSource ? (
        <Image source={lyingSource} resizeMode="contain" style={{ width: spot.size, height: spot.size }} accessibilityLabel={dog} testID="homecoming-lying" />
      ) : (
        <BuddyAvatar appearance={appearance} size={spot.size} mood={lying ? 'idle' : 'excited'} excitedSettleMs={null} name={dog} />
      )}
    </Animated.View>
  );
}

function TreatDots({ count, spot, layout, width }: { count: number; spot: { left: number; top: number; size: number }; layout: SceneLayout; width: number }) {
  const n = count > 0 ? Math.min(MAX_DOTS, Math.max(1, Math.round(count / 4))) : 0;
  const x0 = spot.left + spot.size * 0.45;
  const y0 = spot.top + spot.size * 0.55;
  const x1 = width / 2;
  const y1 = layout.hofTop + layout.yardH + 50;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <TreatDot key={i} i={i} from={{ x: x0, y: y0 }} to={{ x: x1 + (i % 3 - 1) * 10, y: y1 }} />
      ))}
    </>
  );
}

function TreatDot({ i, from, to }: { i: number; from: { x: number; y: number }; to: { x: number; y: number } }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(p, { toValue: 1, duration: DOT_MS, delay: 150 + i * 110, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [p, i]);
  const arc = Math.max(30, Math.abs(to.y - from.y) * 0.3);
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          left: from.x - 6,
          top: from.y - 6,
          opacity: p.interpolate({ inputRange: [0, 0.05, 0.9, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, to.x - from.x] }) },
            { translateY: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, (to.y - from.y) / 2 - arc, to.y - from.y] }) },
          ],
        },
      ]}
    />
  );
}

function PopIn({ children, style }: { children: React.ReactNode; style: React.ComponentProps<typeof Animated.View>['style'] }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 12 });
    anim.start();
    return () => anim.stop();
  }, [pop]);
  return (
    <Animated.View style={[style, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
      {children}
    </Animated.View>
  );
}

function ExtraPieces({
  extras,
  walk,
  layout,
  yard,
  width,
  level,
  levelTitle,
  dog,
}: {
  extras: ReturnType<typeof planExtras>;
  walk: HomecomingWalk;
  layout: SceneLayout;
  yard: WorldYardLayout;
  width: number;
  level: number;
  levelTitle: string | null;
  dog: string;
}) {
  const { rewards } = walk;
  return (
    <>
      {extras.includes('badge') && (
        <PopIn style={[styles.abs, { right: 12, top: layout.hofTop + 10, maxWidth: width * 0.6, transform: [{ rotate: '4deg' }] }]}>
          <WoodSign size="medium" testID="homecoming-badge">
            <ArtImage art="icon-badge" size={28} />
            <Text style={[textStyle('small'), styles.ink]}>{t('homecoming.badgeCaption')}</Text>
            {rewards.unlockedAchievements.map((id) => (
              <Text key={id} style={[textStyle('sign'), styles.ink, styles.smallSign]}>
                {ACHIEVEMENTS[id].copyTitle}
              </Text>
            ))}
          </WoodSign>
        </PopIn>
      )}
      {extras.includes('milestone') && rewards.leveledUpTo !== null && (
        <PopIn style={[styles.abs, { left: 12, right: 12, top: layout.gateSignTop, alignItems: 'center' }]}>
          <WoodSign size="wide" testID="homecoming-milestone">
            <Text style={[textStyle('sign'), styles.ink]}>
              {levelTitle ? `${dog} · ${levelTitle}` : t('doorstep.dogLevel', { dog, level })}
            </Text>
            {rewards.oldTreatsPerWalk !== null && rewards.newTreatsPerWalk !== null && (
              <Text style={[textStyle('small'), styles.ink]}>
                {t('celebration.levelUp.body', {
                  dog,
                  level: rewards.leveledUpTo,
                  newCount: formatNumber(rewards.newTreatsPerWalk),
                  oldCount: formatNumber(rewards.oldTreatsPerWalk),
                })}
              </Text>
            )}
          </WoodSign>
        </PopIn>
      )}
      {extras.includes('pennant') && rewards.tease && <PennantPiece building={rewards.tease.building} layout={layout} yard={yard} />}
    </>
  );
}

function PennantPiece({ building, layout, yard }: { building: keyof WorldYardLayout['world']; layout: SceneLayout; yard: WorldYardLayout }) {
  const pennant = artOr('pennant', null);
  const w = yard.world[building];
  const top = layout.hofTop + layout.yardH - w.pennantBottom - 72;
  return (
    <PopIn style={[styles.abs, { left: w.pennantLeft, top }]}>
      {pennant ? <DecorImage source={pennant} resizeMode="contain" style={{ width: 36, height: 72 }} /> : <View testID="homecoming-pennant" style={styles.pennantFallback} />}
    </PopIn>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  ink: { color: material.ink, textAlign: 'center' },
  smallSign: { fontSize: 15, lineHeight: 18 },
  bigNumber: { color: material.inkGreen, textAlign: 'center', fontSize: 40, lineHeight: 44 },
  bigSign: { position: 'absolute', left: 20 },
  seam: { position: 'absolute', left: 36, right: 36, height: 180, borderRadius: 14 },
  stitching: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: material.inkGreen },
  hint: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: material.muted },
  bowlSign: { position: 'absolute', width: 230, alignItems: 'center' },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#C9A06A' },
  closing: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  closingNote: { paddingVertical: 12 },
  pennantFallback: { width: 24, height: 48, backgroundColor: '#F2786E' },
});

export type { BeatId };
