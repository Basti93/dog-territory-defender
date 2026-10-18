import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';

import { useBackAction } from '../../app/backStack';
import { artOr } from '../../art/artAssets';
import { ACHIEVEMENTS, AchievementId } from '../../economy/personalStats';
import { formatDate, t } from '../../i18n';
import { WoodSign, material, textStyle } from '../../ui';
import { EmptyHook, FenceBadge, FenceFamily, fenceKeepOut, fenceLayout, rosetteArt } from './fencePlan';

// The badges on the yard fence (redesign step 6). Rendered inside the scene's fence layer, so every coordinate is
// tail-relative like the rest of that layer. No per-frame work: the only animation is the one-off swing of a badge
// that just arrived in the homecoming (native driver, runs once).

export const SWING_MS = 1400;
const HOOK_SIGN_W = 84;
const SIGN_W = 240;
const HOOK_SIGN_H = 18;
const HOOK_SILHOUETTE = material.woodDark;
const SMALL_SIGN_TEXT = { fontSize: 15, lineHeight: 18 } as const;

export interface FenceBadgesProps {
  badges: readonly FenceBadge[];
  hook: EmptyHook | null;
  /** Keep the hook's peg reserved but draw nothing (a walk or a homecoming is running), so the badges never jump. */
  hookHidden?: boolean;
  width: number;
  fenceBottom: number;
  /** What hangs in the strip under the fence (see fencePlan's signStrip); the layout keeps clear of it. */
  hasTitle: boolean;
  statusCount: number;
  /** Badges that exist but are not shown yet (the homecoming reveals them in beat 3). Their peg stays reserved. */
  hiddenIds?: readonly AchievementId[];
  /** Badges that swing when they appear (the new ones of a homecoming). */
  swingIds?: readonly AchievementId[];
}

const NO_IDS: readonly AchievementId[] = [];

// Memoised: the scene re-renders every few seconds (bowl projection), the fence does not need to.
export const FenceBadges = React.memo(function FenceBadges({
  badges,
  hook,
  hookHidden = false,
  width,
  fenceBottom,
  hasTitle,
  statusCount,
  hiddenIds = NO_IDS,
  swingIds = NO_IDS,
}: FenceBadgesProps) {
  const [selected, setSelected] = useState<AchievementId | null>(null);

  const layout = useMemo(
    () => fenceLayout({ width, fenceBottom, count: badges.length, withHook: !!hook, keepOut: fenceKeepOut({ width, fenceBottom, hasTitle, statusCount }) }),
    [width, fenceBottom, badges.length, !!hook, hasTitle, statusCount] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // When the fence is full the oldest badges are left off so a new one always has a peg.
  const placed = badges.slice(layout.overflow);
  const { size } = layout;
  const selectedIndex = placed.findIndex((b) => b.id === selected);
  const selectedBadge = selectedIndex >= 0 ? placed[selectedIndex] : null;
  const selectedSlot = selectedIndex >= 0 ? layout.slots[selectedIndex] : null;
  // The sign only counts as open while its badge is actually on a peg (not hidden, not pushed off a full fence):
  // otherwise Back would be swallowed with nothing on screen to close.
  const signOpen = !!selectedBadge && !!selectedSlot && !hiddenIds.includes(selectedBadge.id);
  useBackAction(signOpen, () => setSelected(null));
  useEffect(() => {
    if (selected !== null && !signOpen) setSelected(null);
  }, [selected, signOpen]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {placed.map((badge, i) => {
        const slot = layout.slots[i];
        if (!slot || hiddenIds.includes(badge.id)) return null;
        return (
          <RosettePeg
            key={badge.id}
            family={badge.family}
            size={size}
            left={slot.x}
            top={slot.y}
            swing={swingIds.includes(badge.id)}
            label={t('world.fence.badgeLabel', { name: ACHIEVEMENTS[badge.id].name })}
            testID={`fence-badge-${badge.id}`}
            onPress={() => setSelected((prev) => (prev === badge.id ? null : badge.id))}
          />
        );
      })}
      {hook && !hookHidden && layout.hook && <EmptyHookPeg family={hook.family} size={size} slot={layout.hook} width={width} />}
      {signOpen && selectedBadge && selectedSlot && (
        <View
          pointerEvents="box-none"
          style={[styles.sign, { left: Math.max(6, Math.min(width - SIGN_W - 6, selectedSlot.x + size / 2 - SIGN_W / 2)), top: fenceBottom + 12 }]}
        >
          <WoodSign
            size="small"
            onPress={() => setSelected(null)}
            accessibilityLabel={`${ACHIEVEMENTS[selectedBadge.id].name}, ${t('world.fence.earnedOn', { date: formatDate(selectedBadge.unlockedAt) })}`}
            testID="fence-sign"
          >
            <Text style={[textStyle('sign'), styles.signName, SMALL_SIGN_TEXT]}>{ACHIEVEMENTS[selectedBadge.id].name}</Text>
            <Text style={[textStyle('hand'), styles.signDate]}>{t('world.fence.earnedOn', { date: formatDate(selectedBadge.unlockedAt) })}</Text>
          </WoodSign>
        </View>
      )}
    </View>
  );
});

function RosettePeg({
  family,
  size,
  left,
  top,
  swing,
  label,
  testID,
  onPress,
}: {
  family: FenceFamily;
  size: number;
  left: number;
  top: number;
  swing: boolean;
  label: string;
  testID: string;
  onPress: () => void;
}) {
  // A badge that arrives in the homecoming pops in and swings once about its peg; every other badge just hangs.
  const p = useRef(new Animated.Value(swing ? 0 : 1)).current;
  useEffect(() => {
    if (!swing) return;
    const anim = Animated.timing(p, { toValue: 1, duration: SWING_MS, easing: Easing.linear, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
    // Once per mount: the peg is mounted when the badge is revealed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const source = artOr(rosetteArt(family), null) as ImageSourcePropType | null;
  const half = size / 2;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.abs,
        { left, top, width: size, height: size },
        {
          opacity: p.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1] }),
          transform: [
            { translateY: -half },
            { rotate: p.interpolate({ inputRange: [0, 0.12, 0.35, 0.6, 0.8, 1], outputRange: ['0deg', '16deg', '-11deg', '6deg', '-2deg', '0deg'] }) },
            { translateY: half },
            { scale: p.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0.5, 1, 1] }) },
          ],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
        testID={testID}
        style={{ width: size, height: size }}
      >
        {source ? <Image source={source} resizeMode="contain" style={{ width: size, height: size }} /> : <View style={[styles.fallback, { width: size, height: size, borderRadius: half }]} />}
        <View pointerEvents="none" style={[styles.peg, pegSize(size)]} />
      </Pressable>
    </Animated.View>
  );
}

/** The one empty hook: a faint rosette silhouette and a tiny sign. No numbers, no progress. */
function EmptyHookPeg({ family, size, slot, width }: { family: FenceFamily; size: number; slot: { x: number; y: number }; width: number }) {
  const source = artOr(rosetteArt(family), null) as ImageSourcePropType | null;
  const text = t('world.fence.hookSign');
  const signLeft = Math.max(4, Math.min(width - HOOK_SIGN_W - 4, slot.x + size / 2 - HOOK_SIGN_W / 2));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="fence-hook" accessible accessibilityLabel={text}>
      <View style={[styles.abs, { left: slot.x, top: slot.y, width: size, height: size, opacity: 0.4 }]}>
        {source ? <Image source={source} resizeMode="contain" style={{ width: size, height: size, tintColor: HOOK_SILHOUETTE }} /> : null}
        <View style={[styles.peg, pegSize(size)]} />
      </View>
      <View style={[styles.hookSign, { left: signLeft, top: slot.y + size + 1 }]}>
        <Text numberOfLines={1} style={[textStyle('sign'), styles.hookSignText]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

/** The knob shrinks with the rosette. */
function pegSize(size: number) {
  const d = Math.max(4, Math.round(size * 0.2));
  return { width: d, height: d, borderRadius: d / 2 };
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  // The peg: a small wooden knob where the rosette's top meets the plank.
  peg: {
    position: 'absolute',
    top: -1,
    alignSelf: 'center',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: material.woodDark,
    borderWidth: 1,
    borderColor: material.yarn,
  },
  fallback: { backgroundColor: material.woodLight, borderWidth: 2, borderColor: material.woodRim },
  sign: { position: 'absolute', width: SIGN_W, alignItems: 'center', zIndex: 5 },
  signName: { color: material.ink, textAlign: 'center' },
  signDate: { color: material.inkGreen, textAlign: 'center', fontSize: 20, lineHeight: 24 },
  hookSign: {
    position: 'absolute',
    width: HOOK_SIGN_W,
    height: HOOK_SIGN_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: material.woodLight,
    borderWidth: 1.5,
    borderColor: material.woodRim,
    borderBottomWidth: 3,
    borderBottomColor: material.woodDark,
    borderRadius: 5,
  },
  hookSignText: { fontSize: 12, lineHeight: 14, color: material.ink, textAlign: 'center' },
});
