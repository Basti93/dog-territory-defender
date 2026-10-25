import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatNumber, t } from '../i18n';
import { AnimatedNumber } from './AnimatedNumber';
import { ArtImage } from './ArtImage';
import { material, mix, palette, radii, textStyle } from './theme';
import { tokens } from './tokens';

/** Height of the bar below the top safe-area inset. Screens that float over the bar add this to their inset. */
export const TOP_BAR_H = 44;
/** Centre of the treat chip from the right edge (the harvest flight lands here). */
export const TOP_BAR_CHIP_RIGHT = 12;

export interface TopBarProps {
  /** The bank. Fractions are floored. */
  treats: number;
  /** Small second line after the count: "+x/h", or "full" (warm chip) when `full`. */
  note?: string | null;
  full?: boolean;
  /** Accessibility label for the chip; defaults to the plain count. */
  label?: string;
  /** Tapping the chip (the Hof zooms the bowl). Without it the chip is not a button. */
  onPressTreats?: () => void;
  /** A quiet gear on the left opens Settings. Omitted on the Settings screen itself (and on screens without a way there). */
  onOpenSettings?: () => void;
  /** Optional left slot (screen title or back button), after the gear. */
  left?: React.ReactNode;
}

/**
 * The one status bar every page shares: safe-area aware, always the same height, with the treat count at the right.
 * The number counts up and the chip bumps whenever the count grows (harvest arrival, Buddy bonus).
 * In flow (screens) it pushes content down; in the world scene it floats at the top and the scene lays out below TOP_BAR_H.
 */
export function TopBar({ treats, note, full, label, onPressTreats, onOpenSettings, left }: TopBarProps) {
  const insets = useSafeAreaInsets();
  const count = Math.floor(treats);
  const bump = useRef(new Animated.Value(1)).current;
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) {
      bump.stopAnimation();
      Animated.sequence([
        Animated.timing(bump, { toValue: 1.14, duration: 120, useNativeDriver: true }),
        Animated.spring(bump, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
    previous.current = count;
  }, [count, bump]);
  useEffect(() => () => bump.stopAnimation(), [bump]);

  const chip = (
    <>
      <ArtImage art="icon-treat" size={20} />
      <AnimatedNumber value={count} duration={900} format={(n) => formatNumber(Math.floor(n))} style={[textStyle('sign'), styles.count]} />
      {full ? (
        <View style={styles.fullChip}>
          <Text style={[textStyle('min'), styles.fullText]}>{t('world.treatsFull')}</Text>
        </View>
      ) : note ? (
        <Text style={[textStyle('min'), styles.note]}>{note}</Text>
      ) : null}
    </>
  );
  const accessibilityLabel = label ?? t('topBar.treatsLabel', { count: formatNumber(count) });
  return (
    <View style={[styles.bar, { paddingTop: insets.top, height: insets.top + TOP_BAR_H }]} testID="top-bar">
      <View style={styles.left}>
        {onOpenSettings && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('topBar.settingsLabel')} onPress={onOpenSettings} hitSlop={6} style={styles.gear} testID="top-bar-settings">
            <GearIcon />
          </Pressable>
        )}
        {left}
      </View>
      <Animated.View style={{ transform: [{ scale: bump }] }}>
        {onPressTreats ? (
          <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPressTreats} style={styles.chip} hitSlop={6}>
            {chip}
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={accessibilityLabel} style={styles.chip}>
            {chip}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const GEAR = 20;
const GEAR_INK = `${material.muted}`;

/** A small gear drawn with Views (no art): four bars through the centre make the teeth, a ring with a hole the body. Quiet on purpose. */
function GearIcon() {
  return (
    <View style={styles.gearBox} pointerEvents="none">
      {[0, 45, 90, 135].map((deg) => (
        <View key={deg} style={[styles.gearTooth, { transform: [{ rotate: `${deg}deg` }] }]} />
      ))}
      <View style={styles.gearBody}>
        <View style={styles.gearHole} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  gearBox: { width: GEAR, height: GEAR, alignItems: 'center', justifyContent: 'center' },
  gearTooth: { position: 'absolute', width: GEAR, height: 4, borderRadius: 2, backgroundColor: GEAR_INK },
  gearBody: { width: 14, height: 14, borderRadius: 7, backgroundColor: GEAR_INK, alignItems: 'center', justifyContent: 'center' },
  gearHole: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.white },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingRight: TOP_BAR_CHIP_RIGHT,
    // Cream wash (token white + alpha): sky, map and cloth show through softly.
    backgroundColor: `${tokens.white}E6`,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minHeight: 32,
    borderRadius: radii.chip,
    backgroundColor: material.woodLight,
    borderWidth: 2,
    borderColor: material.woodRim,
    borderBottomWidth: 4,
    borderBottomColor: material.woodDark,
  },
  count: { color: material.ink, fontSize: 18, lineHeight: 22 },
  note: { color: material.muted },
  fullChip: { paddingHorizontal: 8, borderRadius: radii.pill, backgroundColor: mix(tokens.warm, '#FFFFFF', 0.45) },
  fullText: { color: material.ink },
});
