import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { t, useLocale } from '../i18n';
import { Card, palette, spacing, textStyle, tokens } from '../ui';
import { getFeedbackPrefsRepository } from './feedbackRepository';
import { updateFeedbackPrefs, useFeedbackPrefs } from './feedbackPrefs';

/** Drop into SettingsScreen: `<SoundSettingsCard />` (no props). */
export function SoundSettingsCard() {
  useLocale();
  const prefs = useFeedbackPrefs();

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
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  second: { marginTop: spacing.lg },
  rowText: { flex: 1 },
  subtitle: { color: palette.muted, marginTop: spacing.xs },
});
