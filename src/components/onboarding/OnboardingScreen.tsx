import React, { useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BuddyAppearance, defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { ArtKey } from '../../art/artAssets';
import { ArtImage, material, PaperSheet, PressableScale, Screen, spacing, TextLink, textStyle, WoodSign } from '../../ui';
import { BuddyAvatar } from '../buddy';
import { BuddyMood } from '../buddy/buddyMood';
import { t } from '../../i18n';
import { useBackAction } from '../../app/backStack';

// Shown once, before the dog-name prompt, on a fresh install. Presentation
// only: three warm cards, no mechanics, nothing to get wrong.

interface CardSpec {
  titleKey: string;
  bodyKey: string;
  mood: BuddyMood;
  /** Sprites drawn behind/next to Buddy. */
  scene: 'grass' | 'pin' | 'doghouse';
}

const CARDS: CardSpec[] = [
  { titleKey: 'onboarding.card1.title', bodyKey: 'onboarding.card1.body', mood: 'happy', scene: 'grass' },
  { titleKey: 'onboarding.card2.title', bodyKey: 'onboarding.card2.body', mood: 'curious', scene: 'pin' },
  { titleKey: 'onboarding.card3.title', bodyKey: 'onboarding.card3.body', mood: 'excited', scene: 'doghouse' },
];

export interface OnboardingScreenProps {
  onDone: () => void;
  buddyAppearance?: BuddyAppearance;
}

function Scene({ spec, appearance, width, maxBox }: { spec: CardSpec; appearance: BuddyAppearance; width: number; maxBox: number }) {
  // Fixed-size square: never taller than half the pager, so it cannot push the text card out of view.
  const box = Math.max(120, Math.min(width - spacing.lg * 4, 300, maxBox));
  const buddy = <BuddyAvatar appearance={appearance} size={Math.round(box * 0.55)} mood={spec.mood} />;
  if (spec.scene === 'grass') {
    return (
      <View style={[styles.scene, { width: box, height: box }]}>
        <ArtImage art="yard-ground" width={box} height={box * 0.6} style={styles.bottom} />
        <View style={styles.buddyOnGround}>{buddy}</View>
        <ArtImage art="icon-walks" size={56} style={styles.cornerIcon} />
      </View>
    );
  }
  if (spec.scene === 'pin') {
    return (
      <View style={[styles.scene, { width: box, height: box }]}>
        <ArtImage art="celebration-burst" size={box} style={styles.fill} />
        <ArtImage art={'icon-pin' as ArtKey} size={64} style={styles.pin} />
        <View style={styles.buddyOnGround}>{buddy}</View>
      </View>
    );
  }
  return (
    <View style={[styles.scene, { width: box, height: box }]}>
      <ArtImage art="doghouse-3" size={box * 0.8} style={styles.houseBehind} />
      <View style={styles.buddyOnGround}>{buddy}</View>
    </View>
  );
}

export function OnboardingScreen({ onDone, buddyAppearance }: OnboardingScreenProps) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  // iOS does not stretch a horizontal ScrollView's content container to the scroll view's height,
  // so pages get an explicit measured height (0 until the first layout; jest never lays out).
  const [pagerHeight, setPagerHeight] = useState(0);
  const appearance = buddyAppearance ?? defaultBuddyAppearance();
  const last = page === CARDS.length - 1;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };
  // Android back: one card back; on the first card it falls through to the system (app goes to the background).
  useBackAction(page > 0, () => {
    scrollRef.current?.scrollTo({ x: (page - 1) * width, animated: true });
    setPage(page - 1);
  });
  const goNext = () => {
    if (last) return onDone();
    scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
    setPage(page + 1);
  };

  return (
    <Screen backdrop="linen" padded={false}>
      <View style={styles.skipRow}>
        {!last && <TextLink label={t('onboarding.skip')} onPress={onDone} style={styles.skip} />}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
        onLayout={(e) => setPagerHeight(Math.round(e.nativeEvent.layout.height))}
        contentContainerStyle={pagerHeight > 0 ? { height: pagerHeight } : undefined}
      >
        {CARDS.map((spec) => (
          <View key={spec.titleKey} style={[styles.page, { width }, pagerHeight > 0 && { height: pagerHeight }]}
            testID="onboarding-page"
          >
            <Scene spec={spec} appearance={appearance} width={width} maxBox={pagerHeight > 0 ? pagerHeight * 0.5 : 300} />
            <PaperSheet style={styles.textCard}>
              <Text style={[textStyle('signBig'), styles.center, styles.ink]}>{t(spec.titleKey)}</Text>
              <Text style={[textStyle('body'), styles.center, styles.body]}>{t(spec.bodyKey)}</Text>
            </PaperSheet>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {CARDS.map((_, i) => (
            <PressableScale
              key={i}
              onPress={() => {
                scrollRef.current?.scrollTo({ x: i * width, animated: true });
                setPage(i);
              }}
              accessibilityLabel={t('onboarding.page', { page: i + 1, total: CARDS.length })}
              hitSlop={8}
              style={[styles.dot, i === page && styles.dotActive]}
            />
          ))}
        </View>
        <WoodSign size="wide" fullWidth onPress={goNext} style={styles.cta}>
          {last ? t('onboarding.start') : t('common.next')}
        </WoodSign>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skipRow: { minHeight: 48, alignItems: 'flex-end', paddingHorizontal: spacing.lg },
  skip: { minHeight: 44, paddingHorizontal: spacing.md },
  pager: { flex: 1 },
  page: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.xl },
  scene: { alignItems: 'center', justifyContent: 'flex-end' },
  fill: { position: 'absolute', top: 0, left: 0 },
  bottom: { position: 'absolute', bottom: 0 },
  buddyOnGround: { position: 'absolute', bottom: 8 },
  cornerIcon: { position: 'absolute', top: 0, right: 0 },
  pin: { position: 'absolute', top: 8 },
  houseBehind: { position: 'absolute', top: 0 },
  textCard: { alignSelf: 'stretch', gap: spacing.sm },
  center: { textAlign: 'center' },
  body: { color: material.muted },
  ink: { color: material.ink },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: material.woodRim },
  dotActive: { width: 26, backgroundColor: material.inkGreen },
  cta: {},
});
