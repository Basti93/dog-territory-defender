// Step-by-step look picker: 5 choice steps + a "ready?" step. The muzzle/chest accent is baked
// into the painted image skin (see buddy/imageSkin.ts), so its step stays hidden; the saved value
// stays in the data model untouched. Markings are overlay layers and have a step. Every option is
// free and there is no wrong answer; defaults mean "Next" alone is a valid path.
// The one live Buddy at the top previews every change.
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  BUDDY_COATS,
  BUDDY_EAR_STYLES,
  BUDDY_FUR_LENGTHS,
  BUDDY_MARKINGS,
  BUDDY_MUZZLES,
  BUDDY_PALETTE,
  BUDDY_SIZES,
  BUDDY_TAIL_STYLES,
  BuddyAppearance,
  BuddyFur,
  defaultBuddyAppearance,
  FUR_SWATCHES,
  FUR_ZONES,
  FurZone,
  furFromLegacy,
  hexToHsl,
  hslToHex,
  softenToClay,
} from '../../buddy/buddyAppearance';
import { PICKER_STEPS, PickerStep } from '../../buddy/pickerSteps';
import { BuddyAvatar } from './BuddyAvatar';
import { material, PressableScale, radii, spacing, TextLink, textStyle, WoodSign } from '../../ui';
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
const MARKINGS_LABEL_KEY = {
  none: 'buddy.markings.none',
  patch: 'buddy.markings.patch',
  socks: 'buddy.markings.socks',
  mask: 'buddy.markings.mask',
} as const;
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

const HUES = [0, 30, 60, 90, 150, 190, 220, 260, 300, 330];
const LIGHTS = [0.3, 0.45, 0.6, 0.75, 0.9];

type StepKey = PickerStep;
const STEPS: readonly StepKey[] = PICKER_STEPS;

function stepCaption(step: StepKey, name: string): string {
  switch (step) {
    case 'coat':
      return t('buddy.step.coat', { name });
    case 'markings':
      return t('buddy.step.markings', { name });
    case 'fur':
      return t('buddy.step.fur', { name });
    case 'form':
      return t('buddy.step.form');
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
      <Text style={[textStyle('body'), styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
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

  const [zone, setZone] = useState<FurZone | 'all'>('back');

  const set = <K extends keyof BuddyAppearance>(key: K, value: BuddyAppearance[K]) =>
    setLook((prev) => ({ ...prev, [key]: value }));
  // A preset coat/markings choice applies to the zones too (visible, editable in Fell); shape choices are kept.
  const setPreset = <K extends 'coat' | 'markings'>(key: K, value: BuddyAppearance[K]) =>
    setLook((prev) => {
      const next = { ...prev, [key]: value };
      return prev.fur ? { ...next, fur: { ...prev.fur, zones: furFromLegacy(next).zones } } : next;
    });
  /** Edit the fur block; it starts as an exact copy of the preset look, so nothing jumps. */
  const editFur = (change: (fur: BuddyFur) => BuddyFur) =>
    setLook((prev) => ({ ...prev, fur: change(prev.fur ?? furFromLegacy(prev)) }));
  const paint = (hex: string) =>
    editFur((fur) => {
      const colour = softenToClay(hex);
      const zones = { ...fur.zones };
      for (const z of zone === 'all' ? FUR_ZONES : [zone]) zones[z] = colour;
      return { ...fur, zones };
    });
  const furNow = look.fur ?? furFromLegacy(look);
  const currentHex = furNow.zones[zone === 'all' ? 'back' : zone];

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

      <Text style={[textStyle('sign'), styles.caption]}>{stepCaption(step, name)}</Text>

      {step === 'coat' && (
          <View style={styles.row}>
            {BUDDY_COATS.map((c) => (
              <Swatch
                key={c}
                coat={c}
                label={t(COAT_LABEL_KEY[c])}
                selected={look.coat === c}
                onPress={() => setPreset('coat', c)}
              />
            ))}
          </View>
      )}
      {step === 'markings' && (
        <View style={styles.row}>
          {BUDDY_MARKINGS.map((m) => (
            <OptionChip
              key={m}
              label={t(MARKINGS_LABEL_KEY[m])}
              selected={look.markings === m}
              onPress={() => setPreset('markings', m)}
            />
          ))}
        </View>
      )}
      {step === 'fur' && (
        <View style={styles.furBox}>
          <View style={styles.row}>
            {(['all', ...FUR_ZONES] as const).map((z) => (
              <PressableScale
                key={z}
                onPress={() => setZone(z)}
                accessibilityLabel={t(`buddy.zone.${z}`)}
                style={[styles.zoneChip, zone === z && styles.chipSelected]}
              >
                {z !== 'all' && <View style={[styles.zoneDot, { backgroundColor: furNow.zones[z] }]} />}
                <Text style={[textStyle('body'), styles.chipText, zone === z && styles.chipTextSelected]}>
                  {t(`buddy.zone.${z}`)}
                </Text>
              </PressableScale>
            ))}
          </View>
          <View style={styles.row}>
            {FUR_SWATCHES.map((hex) => (
              <PressableScale
                key={hex}
                onPress={() => paint(hex)}
                accessibilityLabel={`${t('buddy.fur.swatch')} ${hex}`}
                style={[styles.dot, currentHex.toUpperCase() === hex && styles.swatchSelected]}
              >
                <View style={[styles.dotFill, { backgroundColor: hex }]} />
              </PressableScale>
            ))}
          </View>
          <Text style={[textStyle('body'), styles.rowLabel]}>{t('buddy.fur.hue')}</Text>
          <View style={styles.row}>
            {HUES.map((h) => (
              <PressableScale
                key={h}
                onPress={() => paint(hslToHex(h, 0.5, hexToHsl(currentHex).l))}
                accessibilityLabel={`${t('buddy.fur.hue')} ${h}`}
                style={styles.dot}
              >
                <View style={[styles.dotFill, { backgroundColor: softenToClay(hslToHex(h, 0.5, 0.6)) }]} />
              </PressableScale>
            ))}
          </View>
          <Text style={[textStyle('body'), styles.rowLabel]}>{t('buddy.fur.light')}</Text>
          <View style={styles.row}>
            {LIGHTS.map((l) => {
              const { h, s } = hexToHsl(currentHex);
              return (
                <PressableScale
                  key={l}
                  onPress={() => paint(hslToHex(h, s, l))}
                  accessibilityLabel={`${t('buddy.fur.light')} ${Math.round(l * 100)}`}
                  style={styles.dot}
                >
                  <View style={[styles.dotFill, { backgroundColor: softenToClay(hslToHex(h, s, l)) }]} />
                </PressableScale>
              );
            })}
          </View>
        </View>
      )}
      {step === 'form' && (
        <View style={styles.furBox}>
          <View style={styles.row}>
            {BUDDY_MUZZLES.map((m) => (
              <OptionChip
                key={m}
                label={t(`buddy.muzzle.${m}`)}
                selected={furNow.muzzle === m}
                onPress={() => editFur((fur) => ({ ...fur, muzzle: m }))}
              />
            ))}
          </View>
          <View style={styles.row}>
            {BUDDY_FUR_LENGTHS.map((f) => (
              <OptionChip
                key={f}
                label={t(`buddy.furLength.${f}`)}
                selected={furNow.furLength === f}
                onPress={() => editFur((fur) => ({ ...fur, furLength: f }))}
              />
            ))}
          </View>
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

      <WoodSign size="wide" onPress={isLast ? finish : () => setStepIndex(stepIndex + 1)} style={styles.primary}>
        {isLast ? t('dogName.submit') : t('common.next')}
      </WoodSign>

      <View style={styles.footer}>
        {stepIndex > 0 ? (
          <TextLink label={t('common.backButton')} onPress={() => setStepIndex(stepIndex - 1)} />
        ) : (
          <View />
        )}
        {onSkip && <TextLink label={t('buddy.skip')} onPress={onSkip} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: material.linen },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  previewCard: {
    width: 230,
    height: 210,
    borderRadius: 8,
    backgroundColor: material.yarn,
    borderWidth: 2,
    borderColor: material.woodRim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  caption: { color: material.ink, textAlign: 'center', marginBottom: spacing.lg, minHeight: 56 },
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
  swatchSelected: { borderColor: material.inkGreen },
  // Shadow lives on this wrapper: overflow hidden on the inner view would clip it on iOS.
  swatchShadow: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: material.yarn,
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
    borderWidth: 2,
    borderColor: material.woodRim,
    backgroundColor: material.yarn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { borderColor: material.inkGreen, borderWidth: 3 },
  chipText: { color: material.ink },
  chipTextSelected: { color: material.inkGreen },
  furBox: { alignSelf: 'stretch', gap: spacing.md },
  rowLabel: { color: material.ink, textAlign: 'center' },
  zoneChip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: material.woodRim,
    backgroundColor: material.yarn,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  zoneDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: material.woodRim },
  dot: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotFill: { width: 30, height: 30, borderRadius: radii.pill, borderWidth: 1, borderColor: material.woodRim },
  primary: { marginTop: spacing.xl, minWidth: 200 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
});
