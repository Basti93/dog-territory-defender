// Step-by-step look picker: 4 choice steps + a "ready?" step. Markings and the
// muzzle/chest accent are baked into the painted image skin (see buddy/imageSkin.ts),
// so their steps are hidden; the saved values stay in the data model untouched. Every option is
// free and there is no wrong answer; defaults mean "Next" alone is a valid path.
// The one live Buddy at the top previews every change.
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  BUDDY_COATS,
  BUDDY_EAR_STYLES,
  BUDDY_PALETTE,
  BUDDY_SIZES,
  BUDDY_TAIL_STYLES,
  BuddyAppearance,
  defaultBuddyAppearance,
} from '../../buddy/buddyAppearance';
import { BuddyAvatar } from './BuddyAvatar';
import { Button, palette, PressableScale, radii, shadows, spacing, textStyle, tokens } from '../../ui';
import { t } from '../../i18n';

export interface BuddyAppearancePickerProps {
  name: string;
  /** Starting look (current saved look, or omit for the default). */
  initial?: BuddyAppearance;
  /** Called with the final look when the player finishes. `onDone` is an alias. */
  onSave?: (appearance: BuddyAppearance) => void;
  onDone?: (appearance: BuddyAppearance) => void;
  /** When given, a Skip button is shown. Caller decides what skipping saves. */
  onSkip?: () => void;
  /** Extra space above the content, for callers with no header of their own. Default 0. */
  topInset?: number;
}

// Option labels are i18n keys (`buddy.coat.*`, `buddy.ear.*`, `buddy.tail.*`, `buddy.size.*`).
const COAT_LABEL_KEY: Record<(typeof BUDDY_COATS)[number], string> = {
  cream: 'buddy.coat.cream',
  golden: 'buddy.coat.golden',
  ginger: 'buddy.coat.ginger',
  chocolate: 'buddy.coat.chocolate',
  charcoal: 'buddy.coat.charcoal',
  grey: 'buddy.coat.grey',
  white: 'buddy.coat.white',
  tricolour: 'buddy.coat.tricolour',
};
const EAR_LABEL_KEY = {
  floppy: 'buddy.ear.floppy',
  pointy: 'buddy.ear.pointy',
  folded: 'buddy.ear.folded',
} as const;
const TAIL_LABEL_KEY = {
  curly: 'buddy.tail.curly',
  straight: 'buddy.tail.straight',
  stubby: 'buddy.tail.stubby',
} as const;
const SIZE_LABEL_KEY = {
  small: 'buddy.size.small',
  medium: 'buddy.size.medium',
  large: 'buddy.size.large',
} as const;

type StepKey = 'coat' | 'earStyle' | 'tailStyle' | 'size' | 'done';
const STEPS: StepKey[] = ['coat', 'earStyle', 'tailStyle', 'size', 'done'];

function stepCaption(step: StepKey, name: string): string {
  switch (step) {
    case 'coat':
      return t('buddy.step.coat', { name });
    case 'earStyle':
      return t('buddy.step.ears');
    case 'tailStyle':
      return t('buddy.step.tail', { name });
    case 'size':
      return t('buddy.step.size');
    case 'done':
      return t('buddy.step.done', { name });
  }
}

function Swatch({
  coat,
  selected,
  label,
  onPress,
}: {
  coat: (typeof BUDDY_COATS)[number];
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      style={[styles.swatchOuter, selected && styles.swatchSelected]}
    >
      <View style={styles.swatchShadow}>
        <View style={styles.swatchInner}>
          {coat === 'tricolour' ? (
            <>
              <View
                style={{
                  flex: 1,
                  backgroundColor: BUDDY_PALETTE.coats.tricolour,
                }}
              />
              <View style={{ flex: 1, backgroundColor: BUDDY_PALETTE.coats.ginger }} />
              <View
                style={{
                  flex: 1,
                  backgroundColor: BUDDY_PALETTE.coats.charcoal,
                }}
              />
            </>
          ) : (
            <View
              style={{
                flex: 1,
                backgroundColor: BUDDY_PALETTE.coats[coat],
              }}
            />
          )}
        </View>
      </View>
    </PressableScale>
  );
}

function OptionChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[textStyle('body'), selected && styles.chipTextSelected]}>{label}</Text>
    </PressableScale>
  );
}

export function BuddyAppearancePicker({
  name,
  initial,
  onSave,
  onDone,
  onSkip,
  topInset = 0,
}: BuddyAppearancePickerProps) {
  const [look, setLook] = useState<BuddyAppearance>(initial ?? defaultBuddyAppearance());
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const isLast = step === 'done';

  const set = <K extends keyof BuddyAppearance>(key: K, value: BuddyAppearance[K]) =>
    setLook((prev) => ({ ...prev, [key]: value }));

  const finish = () => (onSave ?? onDone)?.(look);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: topInset }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.previewCard}>
        <BuddyAvatar appearance={look} size={170} mood="idle" name={name} showCaption />
      </View>

      <Text style={[textStyle('h2'), styles.caption]}>{stepCaption(step, name)}</Text>

      {step === 'coat' && (
          <View style={styles.row}>
            {BUDDY_COATS.map((c) => (
              <Swatch
                key={c}
                coat={c}
                label={t(COAT_LABEL_KEY[c])}
                selected={look.coat === c}
                onPress={() => set('coat', c)}
              />
            ))}
          </View>
      )}
      {step === 'earStyle' && (
        <View style={styles.row}>
          {BUDDY_EAR_STYLES.map((e) => (
            <OptionChip
              key={e}
              label={t(EAR_LABEL_KEY[e])}
              selected={look.earStyle === e}
              onPress={() => set('earStyle', e)}
            />
          ))}
        </View>
      )}
      {step === 'tailStyle' && (
        <View style={styles.row}>
          {BUDDY_TAIL_STYLES.map((tail) => (
            <OptionChip
              key={tail}
              label={t(TAIL_LABEL_KEY[tail])}
              selected={look.tailStyle === tail}
              onPress={() => set('tailStyle', tail)}
            />
          ))}
        </View>
      )}
      {step === 'size' && (
        <View style={styles.row}>
          {BUDDY_SIZES.map((s) => (
            <OptionChip key={s} label={t(SIZE_LABEL_KEY[s])} selected={look.size === s} onPress={() => set('size', s)} />
          ))}
        </View>
      )}

      <Button
        label={isLast ? t('dogName.submit') : t('common.next')}
        onPress={isLast ? finish : () => setStepIndex(stepIndex + 1)}
        style={styles.primary}
      />

      <View style={styles.footer}>
        {stepIndex > 0 ? (
          <Button label={t('common.backButton')} variant="ghost" onPress={() => setStepIndex(stepIndex - 1)} style={styles.textButton} />
        ) : (
          <View style={styles.textButton} />
        )}
        {onSkip && <Button label={t('buddy.skip')} variant="ghost" onPress={onSkip} style={styles.textButton} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  previewCard: {
    width: 230,
    height: 210,
    borderRadius: radii.card,
    backgroundColor: palette.meadowTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    ...shadows.card,
  },
  caption: { textAlign: 'center', marginBottom: spacing.lg, minHeight: 56 },
    row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
  },
  swatchOuter: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: { borderColor: tokens.green },
  // Shadow lives on this wrapper: overflow hidden on the inner view would clip it on iOS.
  swatchShadow: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: palette.card,
    ...shadows.soft,
  },
  swatchInner: {
    flex: 1,
    borderRadius: radii.pill,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  chip: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  chipSelected: {
    borderColor: tokens.green,
    backgroundColor: palette.meadowTint,
  },
  chipTextSelected: { color: palette.greenText },
  primary: { marginTop: spacing.xl, minWidth: 200 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  textButton: { minHeight: 44, minWidth: 96 },
});
