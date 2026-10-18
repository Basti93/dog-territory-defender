import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { t, useLocale } from '../i18n';
import { material, mix, PaperNote, spacing, TextLink, textStyle, tokens, WoodSign } from '../ui';

interface DiscardWalkPromptProps {
  visible: boolean;
  /** "Verwerfen": the walk is dropped, nothing is saved. */
  onDiscard: () => void;
  /** "Weiterlaufen" (also back / outside tap): the walk carries on untouched. */
  onKeepWalking: () => void;
}

/** The one calm question before a walk that has moved is cancelled. The safe answer is the big sign, back counts as "keep walking". */
export function DiscardWalkPrompt({ visible, onDiscard, onKeepWalking }: DiscardWalkPromptProps) {
  useLocale();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onKeepWalking}>
      <View style={styles.backdrop}>
        <PaperNote style={styles.note} testID="discard-walk-prompt">
          <Text style={[textStyle('h2'), styles.ink]}>{t('walk.discard.title')}</Text>
          <Text style={[textStyle('body'), styles.ink]}>{t('walk.discard.body')}</Text>
          <View style={styles.actions}>
            <TextLink label={t('walk.discard.confirm')} onPress={onDiscard} />
            <WoodSign size="medium" onPress={onKeepWalking}>
              {t('walk.discard.keep')}
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
