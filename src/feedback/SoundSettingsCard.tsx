import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { t, useLocale } from '../i18n';
import { useMusicPlaying } from '../app/useAmbientMusic';
import { Card, palette, spacing, textStyle, tokens } from '../ui';
import { getFeedbackPrefsRepository } from './feedbackRepository';
import { updateFeedbackPrefs, useFeedbackPrefs } from './feedbackPrefs';
import { play, SoundName } from './sounds';

const TEST_SOUNDS: SoundName[] = ['tap', 'buddy-1', 'buddy-2', 'buddy-3', 'treat', 'upgrade', 'celebrate', 'new-street', 'reward-reached', 'walk-done', 'sleepy'];

/** Drop into SettingsScreen: `<SoundSettingsCard />` (no props). */
export function SoundSettingsCard() {
  useLocale();
  const prefs = useFeedbackPrefs();
  const musicPlaying = useMusicPlaying();

  return (
    <Card tint="meadow">
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={textStyle('h2')}>{t('settings.sound.title')}</Text>
          <Text style={[textStyle('small'), styles.subtitle]}>{t('settings.sound.subtitle')}</Text>
        </View>
        <Switch
          value={prefs.sound}
          onValueChange={(sound) => updateFeedbackPrefs(getFeedbackPrefsRepository(), { ...prefs, sound })}
          trackColor={{ true: tokens.green }}
          accessibilityLabel={t('settings.sound.title')}
        />
      </View>
      <View style={[styles.row, styles.second]}>
        <View style={styles.rowText}>
          <Text style={textStyle('h2')}>{t('settings.haptics.title')}</Text>
          <Text style={[textStyle('small'), styles.subtitle]}>{t('settings.haptics.subtitle')}</Text>
        </View>
        <Switch
          value={prefs.haptics}
          onValueChange={(haptics) => updateFeedbackPrefs(getFeedbackPrefsRepository(), { ...prefs, haptics })}
          trackColor={{ true: tokens.green }}
          accessibilityLabel={t('settings.haptics.title')}
        />
      </View>
      <View style={[styles.row, styles.second]}>
        <View style={styles.rowText}>
          <Text style={textStyle('h2')}>{t('settings.music.title')}</Text>
          <Text style={[textStyle('small'), styles.subtitle]}>{t('settings.music.subtitle')}</Text>
        </View>
        <Switch
          value={prefs.music}
          disabled={!prefs.sound}
          onValueChange={(music) => updateFeedbackPrefs(getFeedbackPrefsRepository(), { ...prefs, music })}
          trackColor={{ true: tokens.green }}
          accessibilityLabel={t('settings.music.title')}
        />
      </View>
      <View style={styles.second}>
        <Text style={textStyle('h2')}>{t('settings.soundTest.title')}</Text>
        <Text style={[textStyle('small'), styles.subtitle]}>
          {prefs.sound ? t('settings.soundTest.subtitle') : t('settings.soundTest.off')}
        </Text>
        <View style={styles.chips}>
          {TEST_SOUNDS.map((name) => (
            <Pressable
              key={name}
              onPress={() => play(name)}
              accessibilityRole="button"
              accessibilityLabel={t('settings.soundTest.play', { name })}
              style={styles.chip}
            >
              <Text style={textStyle('small')}>{name}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[textStyle('small'), styles.subtitle]}>
          {musicPlaying ? t('settings.soundTest.musicOn') : t('settings.soundTest.musicOff')}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  second: { marginTop: spacing.lg },
  rowText: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { backgroundColor: palette.meadowTint, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  subtitle: { color: palette.muted, marginTop: spacing.xs },
});
