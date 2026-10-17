// Step-by-step look picker: 5 choice steps + a "ready?" step. Every option is
// free and there is no wrong answer; defaults mean "Next" alone is a valid path.
// The one live Buddy at the top previews every change.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  BUDDY_ACCENTS,
  BUDDY_COATS,
  BUDDY_EAR_STYLES,
  BUDDY_MARKINGS,
  BUDDY_PALETTE,
  BUDDY_SIZES,
  BUDDY_TAIL_STYLES,
  BuddyAppearance,
  defaultBuddyAppearance,
} from '../../buddy/buddyAppearance';
import { BuddyAvatar } from './BuddyAvatar';

// Spec tokens only (visual-design): green, blue, brown, off-white, meadow.
const GREEN = '#2ECC71';
const BLUE = '#3498DB';
const BROWN = '#8B6F47';
const OFFWHITE = '#FAFAF8';
const MEADOW = '#DCE8BE';

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
const MARKING_LABEL = { none: 'Clean coat', patch: 'Patch', socks: 'Socks', mask: 'Mask' } as const;
const EAR_LABEL = { floppy: 'Floppy', pointy: 'Perky', folded: 'Folded' } as const;
const TAIL_LABEL = { curly: 'Curly', straight: 'Straight', stubby: 'Fluffy stub' } as const;
const SIZE_LABEL = { small: 'Pocket pup', medium: 'Just right', large: 'Big goof' } as const;
const ACCENT_LABEL = { cream: 'Cream', white: 'White', tan: 'Tan' } as const;

type StepKey = 'coat' | 'markings' | 'earStyle' | 'tailStyle' | 'size' | 'done';
const STEPS: StepKey[] = ['coat', 'markings', 'earStyle', 'tailStyle', 'size', 'done'];

function stepCaption(step: StepKey, name: string): string {
  switch (step) {
    case 'coat':
      return `What does ${name} look like? Pick a coat.`;
    case 'markings':
      return 'Any markings? Spots, patches, or a clean coat.';
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

function Swatch({ coat, accent, selected, label, onPress }: {
  coat?: (typeof BUDDY_COATS)[number];
  accent?: (typeof BUDDY_ACCENTS)[number];
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.swatchOuter, selected && styles.swatchSelected]}
    >
      <View style={styles.swatchInner}>
        {coat === 'tricolour' ? (
          <>
            <View style={{ flex: 1, backgroundColor: BUDDY_PALETTE.coats.tricolour }} />
            <View style={{ flex: 1, backgroundColor: BUDDY_PALETTE.coats.ginger }} />
            <View style={{ flex: 1, backgroundColor: BUDDY_PALETTE.coats.charcoal }} />
          </>
        ) : (
          <View
            style={{
              flex: 1,
              backgroundColor: coat ? BUDDY_PALETTE.coats[coat] : BUDDY_PALETTE.accents[accent ?? 'cream'],
            }}
          />
        )}
      </View>
    </Pressable>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function BuddyAppearancePicker({ name, initial, onSave, onDone, onSkip, topInset = 0 }: BuddyAppearancePickerProps) {
  const [look, setLook] = useState<BuddyAppearance>(initial ?? defaultBuddyAppearance());
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const isLast = step === 'done';

  const set = <K extends keyof BuddyAppearance>(key: K, value: BuddyAppearance[K]) =>
    setLook((prev) => ({ ...prev, [key]: value }));

  const finish = () => (onSave ?? onDone)?.(look);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: topInset }]} keyboardShouldPersistTaps="handled">
      <View style={styles.previewCard}>
        <BuddyAvatar appearance={look} size={170} mood="idle" name={name} showCaption />
      </View>

      <Text style={styles.caption}>{stepCaption(step, name)}</Text>

      {step === 'coat' && (
        <>
          <View style={styles.row}>
            {BUDDY_COATS.map((c) => (
              <Swatch key={c} coat={c} label={COAT_LABEL[c]} selected={look.coat === c} onPress={() => set('coat', c)} />
            ))}
          </View>
          <Text style={styles.subLabel}>Muzzle and chest</Text>
          <View style={styles.row}>
            {BUDDY_ACCENTS.map((a) => (
              <Swatch
                key={a}
                accent={a}
                label={`${ACCENT_LABEL[a]} muzzle`}
                selected={look.accentColour === a}
                onPress={() => set('accentColour', a)}
              />
            ))}
          </View>
        </>
      )}
      {step === 'markings' && (
        <View style={styles.row}>
          {BUDDY_MARKINGS.map((m) => (
            <Chip key={m} label={MARKING_LABEL[m]} selected={look.markings === m} onPress={() => set('markings', m)} />
          ))}
        </View>
      )}
      {step === 'earStyle' && (
        <View style={styles.row}>
          {BUDDY_EAR_STYLES.map((e) => (
            <Chip key={e} label={EAR_LABEL[e]} selected={look.earStyle === e} onPress={() => set('earStyle', e)} />
          ))}
        </View>
      )}
      {step === 'tailStyle' && (
        <View style={styles.row}>
          {BUDDY_TAIL_STYLES.map((t) => (
            <Chip key={t} label={TAIL_LABEL[t]} selected={look.tailStyle === t} onPress={() => set('tailStyle', t)} />
          ))}
        </View>
      )}
      {step === 'size' && (
        <View style={styles.row}>
          {BUDDY_SIZES.map((s) => (
            <Chip key={s} label={SIZE_LABEL[s]} selected={look.size === s} onPress={() => set('size', s)} />
          ))}
        </View>
      )}

      <Pressable
        onPress={isLast ? finish : () => setStepIndex(stepIndex + 1)}
        accessibilityRole="button"
        style={styles.primary}
      >
        <Text style={styles.primaryText}>{isLast ? "Let's go!" : 'Next'}</Text>
      </Pressable>

      <View style={styles.footer}>
        {stepIndex > 0 ? (
          <Pressable onPress={() => setStepIndex(stepIndex - 1)} accessibilityRole="button" style={styles.textButton}>
            <Text style={styles.textButtonLabel}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.textButton} />
        )}
        {onSkip && (
          <Pressable onPress={onSkip} accessibilityRole="button" style={styles.textButton}>
            <Text style={styles.textButtonLabel}>Skip for now</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: OFFWHITE },
  content: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 32 },
  previewCard: {
    width: 230,
    height: 210,
    borderRadius: 28,
    backgroundColor: MEADOW,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  caption: { color: BROWN, fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 18, minHeight: 56 },
  subLabel: { color: BROWN, fontSize: 14, marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  swatchOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: { borderColor: GREEN },
  swatchInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: BROWN,
  },
  chip: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: MEADOW,
    backgroundColor: OFFWHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: GREEN, borderColor: GREEN },
  chipText: { color: BROWN, fontSize: 16, fontWeight: '600' },
  chipTextSelected: { color: OFFWHITE },
  primary: {
    marginTop: 28,
    minWidth: 200,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  primaryText: { color: OFFWHITE, fontSize: 18, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 12 },
  textButton: { minHeight: 44, minWidth: 96, justifyContent: 'center', alignItems: 'center' },
  textButtonLabel: { color: BLUE, fontSize: 16 },
});
