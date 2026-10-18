import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { t, useLocale } from '../i18n';
import { material, mix, PaperNote, spacing, TextLink, textStyle, tokens, WoodSign } from '../ui';

interface LiveSharePromptProps {
  visible: boolean;
  /** The partner's name; null falls back to "dein Haushalt". */
  partnerName: string | null;
  onAnswer: (yes: boolean) => void;
}

/** The one-time, calm question at the first walk start: may the household partner see the walk live? Opt-in, so "no" is as easy as "yes". */
export function LiveSharePrompt({ visible, partnerName, onAnswer }: LiveSharePromptProps) {
  useLocale();
  if (!visible) return null;
  const partner = partnerName ?? t('liveShare.partnerFallback');
  return (
    // Back / outside tap counts as "Lieber nicht": nothing is shared without a clear yes.
    <Modal visible transparent animationType="fade" onRequestClose={() => onAnswer(false)}>
      <View style={styles.backdrop}>
        <PaperNote style={styles.note} testID="live-share-prompt">
          <Text style={[textStyle('h2'), styles.ink]}>{t('liveShare.prompt.title', { partner })}</Text>
          <Text style={[textStyle('body'), styles.ink]}>{t('liveShare.prompt.body')}</Text>
          <View style={styles.actions}>
            <TextLink label={t('liveShare.prompt.no')} onPress={() => onAnswer(false)} />
            <WoodSign size="medium" onPress={() => onAnswer(true)}>
              {t('liveShare.prompt.yes')}
            </WoodSign>
          </View>
        </PaperNote>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: mix(tokens.brown, tokens.text, 0.3) + '40', justifyContent: 'center', padding: spacing.xl },
  note: { gap: spacing.md, padding: spacing.lg },
  ink: { color: material.ink },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
});
