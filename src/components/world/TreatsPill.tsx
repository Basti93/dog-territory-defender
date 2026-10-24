import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatNumber, t } from '../../i18n';
import { AnimatedNumber, ArtImage, material, mix, radii, textStyle, tokens } from '../../ui';
import { bowlAtCap, formatRatePerHour } from './bakeryRules';

/**
 * Always-visible treats counter in the Hof (top-left beside the gate sign): treat icon, big count, tiny "+x/h".
 * At the cap it says "voll" in a warm chip (never a nag). The number counts up like the bowl sign and the pill
 * bumps whenever the count grows. Tapping it zooms the bowl.
 */
export function TreatsPill({
  shown,
  cap,
  ratePerHour,
  welcomeFrom,
  width,
  onPress,
}: {
  shown: number;
  cap: number;
  ratePerHour: number;
  /** Welcome-back: count up from here once (remounts the ticker, same as the bowl sign). */
  welcomeFrom: number | null;
  width: number;
  onPress: () => void;
}) {
  const count = Math.floor(shown);
  const full = bowlAtCap(shown, cap);
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

  return (
    <Animated.View style={{ width, transform: [{ scale: bump }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('world.treatsPillLabel', { count: formatNumber(count), cap: formatNumber(cap) })}
        onPress={onPress}
        style={styles.pill}
      >
        <View style={styles.row}>
          <ArtImage art="icon-treat" size={18} />
          <AnimatedNumber
            key={welcomeFrom === null ? 'live' : 'welcome'}
            from={welcomeFrom ?? undefined}
            value={count}
            duration={900}
            format={(n) => formatNumber(Math.floor(n))}
            style={[textStyle('sign'), styles.count]}
          />
        </View>
        {full ? (
          <View style={styles.fullChip}>
            <Text style={[textStyle('min'), styles.fullText]}>{t('world.treatsFull')}</Text>
          </View>
        ) : ratePerHour > 0 ? (
          <Text style={[textStyle('min'), styles.rate]}>{t('world.treatsRate', { rate: formatRatePerHour(ratePerHour) })}</Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radii.chip,
    backgroundColor: material.woodLight,
    borderWidth: 2,
    borderColor: material.woodRim,
    borderBottomWidth: 4,
    borderBottomColor: material.woodDark,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { color: material.ink, fontSize: 18, lineHeight: 22 },
  rate: { color: material.muted },
  fullChip: { paddingHorizontal: 8, borderRadius: radii.pill, backgroundColor: mix(tokens.warm, '#FFFFFF', 0.45) },
  fullText: { color: material.ink },
});
