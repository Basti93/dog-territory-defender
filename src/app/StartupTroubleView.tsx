import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';

import { Button, palette, spacing, textStyle } from '../ui';
import { log } from '../utils/log';
import { t } from '../i18n';

/**
 * Shown instead of a blank screen when the saved game could not be read at launch (useLaunchEffects onStartupTrouble).
 * Calm and blame-free; "try again" restarts the app's JavaScript, which opens storage afresh.
 */
export function StartupTroubleView() {
  const retry = () => Updates.reloadAsync().catch((error) => log('STARTUP_RETRY_ERROR', { error: String(error) }));
  return (
    <View style={styles.container}>
      <Text style={[textStyle('h1'), styles.text]}>{t('startup.trouble.title')}</Text>
      <Text style={[textStyle('body'), styles.text]}>{t('startup.trouble.body')}</Text>
      <Button label={t('startup.trouble.retry')} onPress={retry} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  text: { textAlign: 'center' },
});
