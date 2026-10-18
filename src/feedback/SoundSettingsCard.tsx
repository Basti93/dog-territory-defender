import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { t, useLocale } from '../i18n';
import { useMusicPlaying } from '../app/useAmbientMusic';
import { material, mix, PaperHint, PaperRow, spacing, textStyle } from '../ui';
import { getFeedbackPrefsRepository } from './feedbackRepository';
import { updateFeedbackPrefs, useFeedbackPrefs } from './feedbackPrefs';
import { play, SoundName } from './sounds';

const TEST_SOUNDS: SoundName[] = ['tap', 'buddy-1', 'buddy-2', 'buddy-3', 'treat', 'upgrade', 'celebrate', 'new-street', 'reward-reached', 'walk-done', 'sleepy'];

/** Drop into SettingsScreen: `<SoundSettingsCard />` (no props). */
export function SoundSettingsCard() {
  useLocale();
  const prefs = useFeedbackPrefs();
  const musicPlaying = useMusicPlaying();

  const toggle = (key: 'sound' | 'haptics' | 'music', title: string, subtitle: string, disabled = false) => (
    <PaperRow
      title={title}
      subtitle={subtitle}
      right={
        <Switch
          value={prefs[key]}
          disabled={disabled}
          onValueChange={(v) => updateFeedbackPrefs(getFeedbackPrefsRepository(), { ...prefs, [key]: v })}
          trackColor={{ true: material.inkGreen }}
          accessibilityLabel={title}
        />
      }
    />
  );

  // Rows only: SettingsScreen puts them under the "Töne" section of the paper sheet.
  return (
    <View>
      {toggle('sound', t('settings.sound.title'), t('settings.sound.subtitle'))}
      {toggle('haptics', t('settings.haptics.title'), t('settings.haptics.subtitle'))}
      {toggle('music', t('settings.music.title'), t('settings.music.subtitle'), !prefs.sound)}
      <View style={styles.second}>
        <Text style={[textStyle('body'), styles.ink]}>{t('settings.soundTest.title')}</Text>
        <PaperHint>{prefs.sound ? t('settings.soundTest.subtitle') : t('settings.soundTest.off')}</PaperHint>
        <View style={styles.chips}>
          {TEST_SOUNDS.map((name) => (
            <Pressable
              key={name}
              onPress={() => play(name)}
              accessibilityRole="button"
              accessibilityLabel={t('settings.soundTest.play', { name })}
              style={styles.chip}
            >
              <Text style={[textStyle('small'), styles.ink]}>{name}</Text>
            </Pressable>
          ))}
        </View>
        <PaperHint>{musicPlaying ? t('settings.soundTest.musicOn') : t('settings.soundTest.musicOff')}</PaperHint>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  second: { marginTop: spacing.md },
  ink: { color: material.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    backgroundColor: material.linen,
    borderWidth: 1,
    borderColor: mix(material.linen, material.woodRim, 0.4),
    borderRadius: 999,
    paddingHorizontal: spacing.md,
  },
});
