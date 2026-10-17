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

const COAT_LABEL: Record<(typeof BUDDY_COATS)[number], string> = {
  cream: 'Cream',
  golden: 'Golden',
  ginger: 'Ginger',
  chocolate: 'Chocolate',
  charcoal: 'Charcoal',
  grey: 'Grey',
  white: 'White',
  tricolour: 'Tricolour',
};
const EAR_LABEL = {
  floppy: 'Floppy',
  pointy: 'Perky',
  folded: 'Folded',
} as const;
const TAIL_LABEL = {
  curly: 'Curly',
  straight: 'Straight',
  stubby: 'Fluffy stub',
} as const;
const SIZE_LABEL = {
  small: 'Pocket pup',
  medium: 'Just right',
  large: 'Big goof',
} as const;

type StepKey = 'coat' | 'earStyle' | 'tailStyle' | 'size' | 'done';
const STEPS: StepKey[] = ['coat', 'earStyle', 'tailStyle', 'size', 'done'];

function stepCaption(step: StepKey, name: string): string {
  switch (step) {
    case 'coat':
      return `What does ${name} look like? Pick a coat.`;
    case 'earStyle':
      return 'Ears: floppy, perky, or somewhere in between.';
    case 'tailStyle':
      return `How does ${name}'s tail go? Curly, fluffy, or wagging straight.`;
    case 'size':
      return 'Big goof or little pocket pup? Choose a size.';
    case 'done':
      return `That's ${name}! Ready to go outside?`;
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
                label={COAT_LABEL[c]}
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
              label={EAR_LABEL[e]}
              selected={look.earStyle === e}
              onPress={() => set('earStyle', e)}
            />
          ))}
        </View>
      )}
      {step === 'tailStyle' && (
        <View style={styles.row}>
          {BUDDY_TAIL_STYLES.map((t) => (
            <OptionChip
              key={t}
              label={TAIL_LABEL[t]}
              selected={look.tailStyle === t}
              onPress={() => set('tailStyle', t)}
            />
          ))}
        </View>
      )}
      {step === 'size' && (
        <View style={styles.row}>
          {BUDDY_SIZES.map((s) => (
            <OptionChip key={s} label={SIZE_LABEL[s]} selected={look.size === s} onPress={() => set('size', s)} />
          ))}
        </View>
      )}

      <Button
        label={isLast ? "Let's go!" : 'Next'}
        onPress={isLast ? finish : () => setStepIndex(stepIndex + 1)}
        style={styles.primary}
      />

      <View style={styles.footer}>
        {stepIndex > 0 ? (
          <Button label="Back" variant="ghost" onPress={() => setStepIndex(stepIndex - 1)} style={styles.textButton} />
        ) : (
          <View style={styles.textButton} />
        )}
        {onSkip && <Button label="Skip for now" variant="ghost" onPress={onSkip} style={styles.textButton} />}
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
